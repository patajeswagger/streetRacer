'use strict';

/**
 * @file audioEngine.js
 * Realistický zvukový engine motoru postavený na Web Audio API.
 *
 * Klíčové designové rozhodnutí:
 *   AudioContext se vytváří až v start() — při kliknutí uživatelem.
 *   load() pouze stáhne raw ArrayBuffery (fetch). Dekódování proběhne
 *   v start() po vytvoření kontextu. Tím se obchází browser autoplay policy.
 *
 * Uzlový graf:
 *   lowSrc  → lowGain  ─┐
 *   midSrc  → midGain  ─┤→ masterGain → destination
 *   highSrc → highGain ─┘
 *   turboSrc → turboGain ──→ destination
 *   blowoff  = one-shot (nový node při každém výstřelu)
 *
 * Simulace řazení:
 *   6 stupňů pokrývá rovnoměrný díl rozsahu SPEED_MIN–SPEED_MAX.
 *   RPM roste od RPM_SHIFT_DOWN po RPM_SHIFT_UP v rámci stupně.
 *   Přeřazení nahoru/dolů dle překročení hranic stupně.
 *   Aktuální RPM je lerpováno k cílovému (inerce AUDIO.RPM_LERP).
 */

class AudioEngine {
  constructor() {
    /** @private @type {AudioContext|null} */
    this._ctx = null;

    /**
     * Raw ArrayBuffery stažené přes fetch.
     * Dekódují se v start() po vytvoření AudioContext.
     * @private
     */
    this._rawBuffers = {
      low:     null,
      mid:     null,
      high:    null,
      turbo:   null,
      blowoff: null,
    };

    /** @private @type {Object.<string, AudioBuffer>} — dekódované buffery */
    this._buffers = {
      low:     null,
      mid:     null,
      high:    null,
      turbo:   null,
      blowoff: null,
    };

    /** @private — aktivní smyčkující source nody */
    this._sources = { low: null, mid: null, high: null, turbo: null };

    /** @private — gain nody */
    this._gains   = { low: null, mid: null, high: null, turbo: null, master: null };

    /** @private */
    this._gear         = 0;
    this._rpm          = AUDIO.RPM_SHIFT_DOWN;
    this._turboFired1  = false;
    this._turboFired2  = false;
    this._blowoffFired = false;
    this._running      = false;

    /** @private — jak dlouho hráč nepřetržitě drží plyn (s) */
    this._throttleHeldTime     = 0;
    /** @private — hodnota _throttleHeldTime z předchozího framu */
    this._prevThrottleHeldTime = 0;

    /** @private — true pokud raw buffery byly staženy */
    this._rawLoaded = false;
  }

  // ─── Načítání ────────────────────────────────────────────────────────────────

  /**
   * Dekóduje WAV data z base64 konstant (AUDIO_BUFFERS z audioBuffers.js).
   * Nevyžaduje fetch ani XHR — funguje na file:// protokolu.
   * AudioContext se vytváří až zde, před první uživatelskou interakcí
   * potřebujeme jen ArrayBuffery — ty získáme z atob().
   * @returns {Promise<void>}
   */
  async load() {
    try {
      // Převod base64 data URI → ArrayBuffer bez fetch/XHR
      for (const key of ['low', 'mid', 'high', 'turbo', 'blowoff']) {
        const dataUri = AUDIO_BUFFERS[key];
        const base64  = dataUri.split(',')[1];
        const binary  = atob(base64);
        const bytes   = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        this._rawBuffers[key] = bytes.buffer;
      }

      this._rawLoaded = true;
      console.log('[AudioEngine] Buffery připraveny, čeká se na start().');

    } catch (err) {
      console.warn('[AudioEngine] Načítání zvuků selhalo:', err.message);
    }
  }

  // ─── Spuštění / zastavení ────────────────────────────────────────────────────

  /**
   * Spustí engine zvuky.
   * Volá se při kliknutí na HRÁT — zde je garantována uživatelská interakce,
   * takže AudioContext lze vytvořit a ihned resume().
   * Dekóduje buffery (pokud ještě nejsou) a spustí smyčky.
   */
  async start() {
    if (this._running) return;

    if (!this._rawLoaded) {
      console.warn('[AudioEngine] start() voláno dříve než load() dokončil — ticho.');
      return;
    }

    // Vytvoř nebo znovu použij AudioContext
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Probudí kontext (povinné po browser autoplay policy)
    await this._ctx.resume();
    console.log('[AudioEngine] AudioContext state:', this._ctx.state);

    // Dekóduj ArrayBuffery → AudioBuffery (musí proběhnout po vytvoření ctx)
    try {
      for (const key of ['low', 'mid', 'high', 'turbo', 'blowoff']) {
        if (this._rawBuffers[key] && !this._buffers[key]) {
          // slice() — decodeAudioData spotřebuje buffer, potřebujeme kopii pro restart
          this._buffers[key] = await this._ctx.decodeAudioData(
            this._rawBuffers[key].slice(0)
          );
        }
      }
    } catch (err) {
      console.error('[AudioEngine] Dekódování selhalo:', err);
      return;
    }

    // Sestav graf
    this._buildGraph();

    // Spusť smyčky
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
    const t      = this._ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(AUDIO.MASTER_VOLUME, t + 0.3);

    // Reset herního stavu
    this._gear              = 0;
    this._rpm               = AUDIO.RPM_SHIFT_DOWN;
    this._turboFired1       = false;
    this._turboFired2       = false;
    this._blowoffFired      = false;
    this._throttleHeldTime  = 0;
    this._prevThrottleHeldTime = 0;
    this._running           = true;

    console.log('[AudioEngine] Engine spuštěn.');
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

    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, tEnd);

    turbo.gain.cancelScheduledValues(t);
    turbo.gain.setValueAtTime(turbo.gain.value, t);
    turbo.gain.linearRampToValueAtTime(0, tEnd);

    setTimeout(() => {
      for (const key of ['low', 'mid', 'high', 'turbo']) {
        if (this._sources[key]) {
          try { this._sources[key].stop(); } catch (_) {}
          this._sources[key] = null;
        }
      }
      // Nuluj gains pro příští start()
      for (const key of Object.keys(this._gains)) {
        this._gains[key] = null;
      }
      ctx.suspend();
      console.log('[AudioEngine] Engine zastaven.');
    }, AUDIO.FADE_OUT_TIME * 1000 + 50);
  }

  // ─── Herní smyčka ────────────────────────────────────────────────────────────

  /**
   * Aktualizuje zvuk motoru každý frame.
   * @param {number}  speedPxPerS - Aktuální rychlost silnice (px/s).
   * @param {boolean} throttle    - True = hráč drží plyn (↑).
   * @param {number}  dt          - Delta time (s).
   */
  update(speedPxPerS, throttle, dt) {
    if (!this._running) return;

    // Sledování doby nepřetržitého držení plynu.
    // _prevThrottleHeldTime uchovává dobu z předchozího framu —
    // v momentě release (throttle false) je throttleHeldTime již 0,
    // ale _prevThrottleHeldTime stále drží hodnotu před nulováním.
    const prevHeld = this._throttleHeldTime;
    if (throttle) {
      this._throttleHeldTime += dt;
    } else {
      this._throttleHeldTime = 0;
    }
    this._prevThrottleHeldTime = prevHeld;

    const targetRpm  = this._calcTargetRpm(speedPxPerS, throttle);
    const lerpFactor = 1 - Math.exp(-AUDIO.RPM_LERP * dt);
    this._rpm        = this._rpm + (targetRpm - this._rpm) * lerpFactor;

    const n = Math.max(0, Math.min(1, this._rpm / AUDIO.RPM_MAX));

    this._updateLayers(n);
    this._updateTurbo(n);
    this._updateBlowoff(n, throttle);
  }

  // ─── Privátní — graf ─────────────────────────────────────────────────────────

  /**
   * Sestaví audio uzlový graf. Volá se při každém start().
   * @private
   */
  _buildGraph() {
    const ctx = this._ctx;

    this._gains.master = ctx.createGain();
    this._gains.master.gain.value = 0;
    this._gains.master.connect(ctx.destination);

    this._gains.turbo = ctx.createGain();
    this._gains.turbo.gain.value = 0;
    this._gains.turbo.connect(ctx.destination);

    for (const layer of ['low', 'mid', 'high']) {
      const gain = ctx.createGain();
      gain.gain.value = layer === 'low' ? 1 : 0;   // low jako výchozí vrstva
      gain.connect(this._gains.master);
      this._gains[layer] = gain;
    }
  }

  // ─── Privátní — simulace řazení ──────────────────────────────────────────────

  /**
   * Vypočítá cílové RPM dle aktuální rychlosti a simulace řazení.
   *
   * Hranice stupňů (px/s, odpovídají km/h přes PX_PER_S_TO_KMH):
   *   1. stupeň:  0 – 225  (0 – 60 km/h)
   *   2. stupeň: 225 – 450  (60 – 120 km/h)
   *   3. stupeň: 450 – 675  (120 – 180 km/h)
   *   4. stupeň: 675 – 975  (180 – 260 km/h)
   *   5. stupeň: 975 – 1200 (260 – 320 km/h)
   *   6. stupeň: 1200+      (320+ km/h)
   *
   * @private
   */
  _calcTargetRpm(speed, throttle) {
    const thresholds = AUDIO.GEAR_THRESHOLDS;   // [0, 225, 450, 675, 975, 1200]
    const maxGear    = AUDIO.GEAR_COUNT - 1;     // 5 (0-based)

    // Přeřazení nahoru
    while (this._gear < maxGear && speed >= thresholds[this._gear + 1]) {
      this._gear++;
      this._rpm = AUDIO.RPM_SHIFT_DOWN;
    }
    // Přeřazení dolů
    while (this._gear > 0 && speed < thresholds[this._gear]) {
      this._gear--;
    }

    // Pozice v aktuálním stupni (0–1)
    const gearLow  = thresholds[this._gear];
    const gearHigh = this._gear < maxGear ? thresholds[this._gear + 1] : thresholds[maxGear] * 1.1;
    const posInGear = Math.max(0, Math.min(1, (speed - gearLow) / (gearHigh - gearLow)));

    let targetRpm = AUDIO.RPM_SHIFT_DOWN +
      posInGear * (AUDIO.RPM_SHIFT_UP - AUDIO.RPM_SHIFT_DOWN);

    if (!throttle) {
      targetRpm = Math.max(AUDIO.RPM_SHIFT_DOWN * 0.7, targetRpm * 0.6);
    }

    return targetRpm;
  }

  // ─── Privátní — audio uzly ───────────────────────────────────────────────────

  /** @private */
  _updateLayers(n) {
    const pitch    = AUDIO.PITCH_MIN + n * (AUDIO.PITCH_MAX - AUDIO.PITCH_MIN);
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

  /** @private */
  _updateTurbo(_n) {
    // Turbo one-shot vypnut
  }

  /** @private */
  _updateBlowoff(n, throttle) {
    // Přehrát blowoff při release plynu, pokud byl plyn držen alespoň 1s.
    // Používáme _prevThrottleHeldTime — v momentě release je throttleHeldTime
    // již vynulováno, ale prevThrottleHeldTime drží hodnotu z předchozího framu.
    const wasHeldLong = this._prevThrottleHeldTime >= AUDIO.TURBO_THROTTLE_MIN;

    if (!throttle && wasHeldLong && !this._blowoffFired) {
      this._blowoffFired = true;
      this._playOneShot(this._buffers.blowoff, AUDIO.BLOWOFF_VOLUME);
    }

    // Reset flagu při novém přidání plynu
    if (throttle) this._blowoffFired = false;
  }

  // ─── Privátní — pomocné ──────────────────────────────────────────────────────

  /** @private */
  _createLoopSource(buffer) {
    const src  = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop   = true;
    return src;
  }

  /**
   * Přehraje buffer jako one-shot přímo do destination.
   * @private
   */
  _playOneShot(buffer, volume) {
    if (!buffer || !this._ctx) return;

    const gainNode = this._ctx.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(this._ctx.destination);

    const src  = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop   = false;
    src.connect(gainNode);
    src.start(0);
    src.onended = () => { try { gainNode.disconnect(); } catch (_) {} };
  }

  /**
   * Plynule nastaví gain hodnotu (zamezí klikání / praskání).
   * @private
   */
  _setGain(gainNode, value) {
    if (!gainNode) return;
    const t = this._ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setTargetAtTime(value, t, 0.016);
  }
}
