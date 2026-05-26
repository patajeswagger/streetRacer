'use strict';

/**
 * @file audioEngine.js
 * Realistický zvukový engine motoru postavený na Web Audio API.
 *
 * Architektura uzlů:
 *   lowSrc  → lowGain  ─┐
 *   midSrc  → midGain  ─┤→ masterGain → destination
 *   highSrc → highGain ─┘
 *   turboSrc → turboGain ──────────────→ destination
 *   blowoff  = one-shot node (nový AudioBufferSourceNode při každém výstřelu)
 *
 * Simulace řazení:
 *   - 6 stupňů, každý pokrývá rovnoměrný díl rozsahu SPEED_MIN–SPEED_MAX.
 *   - V každém stupni RPM lineárně roste od RPM_SHIFT_DOWN po RPM_SHIFT_UP.
 *   - Při překročení RPM_SHIFT_UP → stupeň++, RPM skočí na RPM_SHIFT_DOWN.
 *   - Při poklesu pod spodní hranici stupně → stupeň--.
 *   - Aktuální RPM je vždy lerpováno k cílovému RPM (inerce AUDIO.RPM_LERP).
 *
 * Turbo one-shot:
 *   - Sleduje přechody n přes prahy TURBO_THRESHOLD_1 a TURBO_THRESHOLD_2.
 *   - Každý práh má vlastní flag; resetuje se při poklesu n pod práh.
 *   - One-shot se přehraje max. jednou za průchod prahem.
 *
 * Blowoff:
 *   - Spustí se při puštění plynu (throttle = false) pokud n > BLOWOFF_MIN_N.
 *   - Přehraje se max. jednou; flag se resetuje při dalším throttle = true.
 */

class AudioEngine {
  constructor() {
    /** @private @type {AudioContext|null} */
    this._ctx = null;

    /** @private — AudioBuffers načtené z WAV souborů */
    this._buffers = {
      low:     null,
      mid:     null,
      high:    null,
      turbo:   null,
      blowoff: null,
    };

    /** @private — aktivní smyčkující source nody */
    this._sources = {
      low:   null,
      mid:   null,
      high:  null,
      turbo: null,
    };

    /** @private — gain nody */
    this._gains = {
      low:    null,
      mid:    null,
      high:   null,
      turbo:  null,
      master: null,
    };

    /** @private — aktuální simulovaný rychlostní stupeň (0–GEAR_COUNT-1) */
    this._gear = 0;

    /** @private — aktuální RPM (lerpované) */
    this._rpm = AUDIO.RPM_SHIFT_DOWN;

    /** @private — flagy pro turbo one-shot (true = práh byl již překročen) */
    this._turboFired1 = false;
    this._turboFired2 = false;

    /** @private — blowoff flag (true = blowoff již přehrán, čeká na reset) */
    this._blowoffFired = false;

    /** @private — zda engine právě běží */
    this._running = false;

    /** @private — zda byly buffery úspěšně načteny */
    this._loaded = false;
  }

  // ─── Načítání ────────────────────────────────────────────────────────────────

  /**
   * Načte všechny WAV soubory a dekóduje je do AudioBufferů.
   * Volá se při inicializaci hry (na pozadí, neblokuje).
   * @returns {Promise<void>}
   */
  async load() {
    const files = {
      low:     'assets/engine-low.wav',
      mid:     'assets/engine-mid.wav',
      high:    'assets/engine-high.wav',
      turbo:   'assets/turbo.wav',
      blowoff: 'assets/blowoff.wav',
    };

    // AudioContext vytváříme co nejpozději — až při load(), ne v konstruktoru
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();

    try {
      const entries = Object.entries(files);
      const results = await Promise.all(
        entries.map(async ([key, path]) => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
          return [key, audioBuffer];
        })
      );

      for (const [key, buf] of results) {
        this._buffers[key] = buf;
      }

      this._loaded = true;
      this._buildGraph();

    } catch (err) {
      console.warn('[AudioEngine] Načítání zvuků selhalo:', err.message);
    }
  }

  // ─── Graf uzlů ───────────────────────────────────────────────────────────────

  /**
   * Sestaví audio uzlový graf.
   * Volá se po úspěšném načtení bufferů.
   * @private
   */
  _buildGraph() {
    const ctx = this._ctx;

    // Master gain (engine vrstvy)
    this._gains.master = ctx.createGain();
    this._gains.master.gain.value = 0;   // začínáme ztlumeně, start() fade-in
    this._gains.master.connect(ctx.destination);

    // Turbo gain (přímé připojení)
    this._gains.turbo = ctx.createGain();
    this._gains.turbo.gain.value = 0;
    this._gains.turbo.connect(ctx.destination);

    // Engine vrstvy
    for (const layer of ['low', 'mid', 'high']) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this._gains.master);
      this._gains[layer] = gain;
    }
  }

  // ─── Spuštění / zastavení ────────────────────────────────────────────────────

  /**
   * Spustí engine zvuky. Volá se při kliknutí na HRÁT.
   * Pokud buffery ještě nejsou načteny, ticho (bez chyb).
   */
  start() {
    if (!this._loaded || this._running) return;

    this._ctx.resume();

    // Spustí smyčkující source nody pro engine vrstvy + turbo
    for (const layer of ['low', 'mid', 'high']) {
      this._sources[layer] = this._createLoopSource(this._buffers[layer]);
      this._sources[layer].connect(this._gains[layer]);
      this._sources[layer].start(0);
    }

    this._sources.turbo = this._createLoopSource(this._buffers.turbo);
    this._sources.turbo.connect(this._gains.turbo);
    this._sources.turbo.start(0);

    // Fade-in master gainu
    const master = this._gains.master;
    master.gain.cancelScheduledValues(this._ctx.currentTime);
    master.gain.setValueAtTime(0, this._ctx.currentTime);
    master.gain.linearRampToValueAtTime(AUDIO.MASTER_VOLUME, this._ctx.currentTime + 0.3);

    // Reset stavu
    this._gear          = 0;
    this._rpm           = AUDIO.RPM_SHIFT_DOWN;
    this._turboFired1   = false;
    this._turboFired2   = false;
    this._blowoffFired  = false;
    this._running       = true;
  }

  /**
   * Zastaví engine zvuky s fade-outem. Volá se při game over.
   */
  stop() {
    if (!this._running) return;
    this._running = false;

    const ctx    = this._ctx;
    const master = this._gains.master;
    const turbo  = this._gains.turbo;
    const t      = ctx.currentTime;
    const tEnd   = t + AUDIO.FADE_OUT_TIME;

    // Fade-out master + turbo
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, tEnd);

    turbo.gain.cancelScheduledValues(t);
    turbo.gain.setValueAtTime(turbo.gain.value, t);
    turbo.gain.linearRampToValueAtTime(0, tEnd);

    // Zastavení source nodů po fade-outu
    setTimeout(() => {
      for (const key of ['low', 'mid', 'high', 'turbo']) {
        if (this._sources[key]) {
          try { this._sources[key].stop(); } catch (_) {}
          this._sources[key] = null;
        }
      }
      ctx.suspend();
    }, AUDIO.FADE_OUT_TIME * 1000 + 50);
  }

  // ─── Herní smyčka ────────────────────────────────────────────────────────────

  /**
   * Aktualizuje zvuk motoru každý frame.
   * Volá se z herní smyčky hry.
   *
   * @param {number}  speedPxPerS - Aktuální rychlost silnice (px/s).
   * @param {boolean} throttle    - True = hráč drží plyn (↑).
   * @param {number}  dt          - Delta time (s).
   */
  update(speedPxPerS, throttle, dt) {
    if (!this._running) return;

    // 1. Simulace řazení → cílové RPM
    const targetRpm = this._calcTargetRpm(speedPxPerS, throttle);

    // 2. Lerp RPM (inerce motoru)
    const lerpFactor = 1 - Math.exp(-AUDIO.RPM_LERP * dt);
    this._rpm = this._rpm + (targetRpm - this._rpm) * lerpFactor;

    // 3. Normalizovaná hodnota n ∈ [0, 1]
    const n = Math.max(0, Math.min(1, this._rpm / AUDIO.RPM_MAX));

    // 4. Crossfade engine vrstev + pitch
    this._updateLayers(n);

    // 5. Turbo one-shot
    this._updateTurbo(n);

    // 6. Blowoff
    this._updateBlowoff(n, throttle);
  }

  // ─── Privátní — simulace řazení ──────────────────────────────────────────────

  /**
   * Vypočítá cílové RPM na základě aktuální rychlosti a simulace řazení.
   *
   * Každý ze 6 stupňů pokrývá rovnoměrný díl rozsahu SPEED_MIN–SPEED_MAX.
   * V každém stupni RPM roste lineárně od RPM_SHIFT_DOWN do RPM_SHIFT_UP.
   * Přeřazení nahoru: rychlost překročila horní hranici stupně.
   * Přeřazení dolů:  rychlost klesla pod spodní hranici stupně.
   *
   * @private
   * @param {number}  speed
   * @param {boolean} throttle
   * @returns {number} Cílové RPM
   */
  _calcTargetRpm(speed, throttle) {
    const speedMin  = PHYSICS.SPEED_MIN;
    const speedMax  = PHYSICS.SPEED_MAX;
    const gearCount = AUDIO.GEAR_COUNT;

    // Šířka jednoho stupně v px/s
    const gearSpan = (speedMax - speedMin) / gearCount;

    // Hranice aktuálního stupně
    const gearLow  = speedMin + this._gear * gearSpan;
    const gearHigh = gearLow + gearSpan;

    // Přeřazení nahoru
    if (speed >= gearHigh && this._gear < gearCount - 1) {
      this._gear++;
      this._rpm = AUDIO.RPM_SHIFT_DOWN;
    }

    // Přeřazení dolů
    if (speed < gearLow && this._gear > 0) {
      this._gear--;
    }

    // Pozice v aktuálním stupni (0–1)
    const gearLowCurrent  = speedMin + this._gear * gearSpan;
    const gearHighCurrent = gearLowCurrent + gearSpan;
    const posInGear = Math.max(0, Math.min(1,
      (speed - gearLowCurrent) / (gearHighCurrent - gearLowCurrent)
    ));

    // Cílové RPM v tomto stupni
    let targetRpm = AUDIO.RPM_SHIFT_DOWN +
      posInGear * (AUDIO.RPM_SHIFT_UP - AUDIO.RPM_SHIFT_DOWN);

    // Při brzdění / puštění plynu RPM klesá rychleji
    if (!throttle) {
      targetRpm = Math.max(AUDIO.RPM_SHIFT_DOWN * 0.7, targetRpm * 0.6);
    }

    return targetRpm;
  }

  // ─── Privátní — audio uzly ───────────────────────────────────────────────────

  /**
   * Nastaví gain a playbackRate engine vrstev dle n.
   * Crossfade vzorec shodný s Phaser snippetem.
   * @private
   * @param {number} n - Normalizované RPM [0, 1].
   */
  _updateLayers(n) {
    const pitch = AUDIO.PITCH_MIN + n * (AUDIO.PITCH_MAX - AUDIO.PITCH_MIN);

    const gainLow  = 1 - n;
    const gainMid  = Math.max(0, 1 - Math.abs(n - 0.5) * 2);
    const gainHigh = n;

    this._setGain(this._gains.low,  gainLow);
    this._setGain(this._gains.mid,  gainMid);
    this._setGain(this._gains.high, gainHigh);

    for (const layer of ['low', 'mid', 'high']) {
      if (this._sources[layer]) {
        this._sources[layer].playbackRate.value = pitch;
      }
    }
  }

  /**
   * Hlídá přechody n přes turbo prahy a přehraje one-shot.
   * @private
   * @param {number} n
   */
  _updateTurbo(n) {
    // Práh 1: n přešel přes TURBO_THRESHOLD_1 nahoru
    if (n >= AUDIO.TURBO_THRESHOLD_1 && !this._turboFired1) {
      this._turboFired1 = true;
      this._playOneShot(this._buffers.turbo, AUDIO.TURBO_VOLUME, this._gains.turbo);
    }
    // Reset flagu při poklesu pod práh
    if (n < AUDIO.TURBO_THRESHOLD_1 - 0.05) {
      this._turboFired1 = false;
    }

    // Práh 2: n přešel přes TURBO_THRESHOLD_2 nahoru
    if (n >= AUDIO.TURBO_THRESHOLD_2 && !this._turboFired2) {
      this._turboFired2 = true;
      this._playOneShot(this._buffers.turbo, AUDIO.TURBO_VOLUME * 0.8, this._gains.turbo);
    }
    if (n < AUDIO.TURBO_THRESHOLD_2 - 0.05) {
      this._turboFired2 = false;
    }
  }

  /**
   * Přehraje blowoff při puštění plynu na vysokých otáčkách.
   * @private
   * @param {number}  n
   * @param {boolean} throttle
   */
  _updateBlowoff(n, throttle) {
    if (!throttle && n > AUDIO.BLOWOFF_MIN_N && !this._blowoffFired) {
      this._blowoffFired = true;
      this._playOneShot(this._buffers.blowoff, AUDIO.BLOWOFF_VOLUME, null);
    }
    // Reset flagu při dalším přidání plynu
    if (throttle) {
      this._blowoffFired = false;
    }
  }

  // ─── Privátní — pomocné ──────────────────────────────────────────────────────

  /**
   * Vytvoří nový smyčkující AudioBufferSourceNode.
   * @private
   * @param {AudioBuffer} buffer
   * @returns {AudioBufferSourceNode}
   */
  _createLoopSource(buffer) {
    const src  = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop   = true;
    return src;
  }

  /**
   * Přehraje buffer jako one-shot (nový node, bez smyčky).
   * Pokud gainNode není zadán, připojí přímo na destination.
   * @private
   * @param {AudioBuffer}   buffer
   * @param {number}        volume
   * @param {GainNode|null} gainNode
   */
  _playOneShot(buffer, volume, gainNode) {
    if (!buffer) return;

    const gainShot = this._ctx.createGain();
    gainShot.gain.value = volume;
    gainShot.connect(gainNode ? gainNode : this._ctx.destination);

    const src  = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop   = false;
    src.connect(gainShot);
    src.start(0);

    // Automatický úklid po dohraní
    src.onended = () => {
      try { gainShot.disconnect(); } catch (_) {}
    };
  }

  /**
   * Plynule nastaví gain hodnotu (zamezí klikání).
   * @private
   * @param {GainNode} gainNode
   * @param {number}   value
   */
  _setGain(gainNode, value) {
    if (!gainNode) return;
    const t = this._ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setTargetAtTime(value, t, 0.016);   // ~1 frame smoothing
  }
}
