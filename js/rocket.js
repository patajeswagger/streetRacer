'use strict';

/**
 * @file rocket.js
 * Raketomet — hráč vystřelí raketu mezerníkem (cooldown 5 s).
 *
 * Raketa:
 *  - Letí nahoru z pozice hráčova auta.
 *  - Koliduje s jakýmkoliv dopravním nebo policejním autem (AABB).
 *  - Při nárazu (nebo vyletění mimo obrazovku) exploduje.
 *
 * Vizuál rakety:
 *  - Tělo: bílý/šedý válec s červeným hrotem.
 *  - Výfuk: animovaný plamen (žlutá → oranžová).
 *
 * Výbuch:
 *  - Expandující ohnivá kružnice.
 *  - Zlaté a oranžové jiskry ve hvězdicovém vzoru.
 *  - Šedý kouřový mrak.
 *  - Bílý záblesk (flash ring).
 */

// ─── Rocket ───────────────────────────────────────────────────────────────────

class Rocket {
  /**
   * @param {SVGElement} svg - Kořenový SVG element.
   * @param {number}     cx  - X střed výstřelu (střed hráčova auta).
   * @param {number}     cy  - Y střed výstřelu (přední okraj hráče).
   */
  constructor(svg, cx, cy) {
    this._svg    = svg;
    this._cx     = cx;
    this._cy     = cy;

    /** Rychlost rakety nahoru (px/s) */
    this._speed  = 900;

    /** Příznak aktivity */
    this.active  = true;

    /** Příznak, zda raketa explodovala (pro spawn efektu z venku) */
    this.exploded = false;

    /** Pozice výbuchu */
    this.explosionX = cx;
    this.explosionY = cy;

    this._flamePhase = 0;

    this._createElements();
  }

  // ─── Privátní — SVG ─────────────────────────────────────────────────────────

  _ns(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  _createElements() {
    const g = this._ns('g');
    g.setAttribute('id', `rocket-${Math.random().toString(36).slice(2)}`);

    // Výfukový plamen (vzadu — pod tělem)
    this._flame = this._ns('ellipse');
    this._flame.setAttribute('rx', '5');
    this._flame.setAttribute('ry', '10');
    this._flame.setAttribute('cx', '0');
    this._flame.setAttribute('cy', '14');
    this._flame.setAttribute('fill', '#ff8c00');
    this._flame.setAttribute('opacity', '0.9');

    // Vnitřní plamen
    this._flameInner = this._ns('ellipse');
    this._flameInner.setAttribute('rx', '3');
    this._flameInner.setAttribute('ry', '6');
    this._flameInner.setAttribute('cx', '0');
    this._flameInner.setAttribute('cy', '14');
    this._flameInner.setAttribute('fill', '#fff176');
    this._flameInner.setAttribute('opacity', '1');

    // Tělo rakety
    const body = this._ns('rect');
    body.setAttribute('x', '-6');
    body.setAttribute('y', '-14');
    body.setAttribute('width', '12');
    body.setAttribute('height', '26');
    body.setAttribute('rx', '3');
    body.setAttribute('fill', '#dce3ea');

    // Červeno-bílý pruh
    const stripe = this._ns('rect');
    stripe.setAttribute('x', '-6');
    stripe.setAttribute('y', '-2');
    stripe.setAttribute('width', '12');
    stripe.setAttribute('height', '6');
    stripe.setAttribute('fill', '#e53935');

    // Hrot rakety
    const tip = this._ns('polygon');
    tip.setAttribute('points', '0,-24 -6,-14 6,-14');
    tip.setAttribute('fill', '#e53935');

    // Křidélka (fins)
    const finL = this._ns('polygon');
    finL.setAttribute('points', '-6,8 -13,18 -6,12');
    finL.setAttribute('fill', '#90a4ae');

    const finR = this._ns('polygon');
    finR.setAttribute('points', '6,8 13,18 6,12');
    finR.setAttribute('fill', '#90a4ae');

    // Výfukové kroužky (motion trail)
    this._trail = this._ns('g');

    g.appendChild(this._trail);
    g.appendChild(this._flame);
    g.appendChild(this._flameInner);
    g.appendChild(finL);
    g.appendChild(finR);
    g.appendChild(body);
    g.appendChild(stripe);
    g.appendChild(tip);

    this._group = g;
    this._svg.appendChild(g);

    this._updateTransform();
  }

  _updateTransform() {
    this._group.setAttribute(
      'transform',
      `translate(${Math.round(this._cx)}, ${Math.round(this._cy)})`
    );
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  /**
   * @param {number} dt - Delta time (s).
   */
  update(dt) {
    if (!this.active) return;

    this._cy -= this._speed * dt;

    // Animace plamene
    this._flamePhase += dt * 18;
    const ry = 8 + Math.sin(this._flamePhase) * 4;
    this._flame.setAttribute('ry', String(ry));
    this._flameInner.setAttribute('ry', String(ry * 0.55));

    // Mimo obrazovku → zrušit
    if (this._cy < -40) {
      this._detonate(false);
      return;
    }

    this._updateTransform();
  }

  /**
   * Vrátí hitbox rakety ve světových souřadnicích.
   */
  getHitbox() {
    return { x: this._cx - 6, y: this._cy - 24, width: 12, height: 38 };
  }

  /**
   * Spustí výbuch a deaktivuje raketu.
   * @param {boolean} hit - true = zasáhla cíl, false = vyletěla z obrazovky.
   */
  _detonate(hit) {
    this.active     = false;
    this.exploded   = hit;
    this.explosionX = this._cx;
    this.explosionY = this._cy;
    this.remove();
  }

  /**
   * Vnější volání při detekci kolize s autem.
   */
  detonate() {
    this._detonate(true);
  }

  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}

// ─── RocketManager ────────────────────────────────────────────────────────────

class RocketManager {
  /**
   * @param {SVGElement}  svg          - Kořenový SVG element.
   * @param {PlayerCar}   playerCar    - Reference na hráčovo auto.
   * @param {InputManager} inputManager - Sdílený správce vstupu.
   */
  constructor(svg, playerCar, inputManager) {
    this._svg          = svg;
    this._playerCar    = playerCar;
    this._inputManager = inputManager;

    /** @type {Rocket[]} */
    this._rockets = [];

    /** Cooldown zbývající (s) */
    this._cooldown = 0;

    /** Příznak: byl mezerník stisknut minulý frame? */
    this._prevSpace = false;

    /** Nastavíme listener na mezerník */
    this._boundKeyDown = this._onKeyDown.bind(this);
    document.addEventListener('keydown', this._boundKeyDown);

    /** Příznak: "teď vystřel" — nastavuje listener, konzumuje herní loop */
    this._fireRequested = false;
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  _onKeyDown(e) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this._fireRequested = true;
    }
  }

  _fire() {
    const hitbox = this._playerCar.getHitbox();
    const cx = hitbox.x + hitbox.width / 2;
    const cy = hitbox.y; // přední okraj auta
    const r  = new Rocket(this._svg, cx, cy);
    this._rockets.push(r);
    this._cooldown = ROCKET.COOLDOWN;
  }

  // ─── Veřejné ─────────────────────────────────────────────────────────────────

  /**
   * Aktualizuje rakety, cooldown a vstup.
   * @param {number} dt
   * @param {Array}  trafficCars  - TrafficCar[]
   * @param {Array}  policeCars   - PoliceCar[]
   * @param {ParticleSystem} particleSystem
   * @param {ScoreSystem} scoreSystem
   * @returns {void}
   */
  update(dt, trafficCars, policeCars, particleSystem, scoreSystem) {
    // Cooldown
    if (this._cooldown > 0) {
      this._cooldown = Math.max(0, this._cooldown - dt);
    }

    // Výstřel
    if (this._fireRequested) {
      this._fireRequested = false;
      if (this._cooldown <= 0) {
        this._fire();
      }
    }

    // Pohyb raket + kolize
    for (const rocket of this._rockets) {
      if (!rocket.active) continue;
      rocket.update(dt);
      if (!rocket.active) continue; // update mohl deaktivovat

      const rh = rocket.getHitbox();
      const allCars = [...trafficCars, ...policeCars];

      for (const car of allCars) {
        if (!car.active) continue;
        const ch = car.getHitbox();
        if (this._aabb(rh, ch)) {
          rocket.detonate();
          // Výbuch
          particleSystem.spawnExplosion(rocket.explosionX, rocket.explosionY);
          // Zničení auta
          car.active = false;
          car.remove();
          // Bonus skóre
          scoreSystem.addCoins(3);
          break;
        }
      }

      // Vyletělo bez zásahu — ale exploded = false, spawnExplosion nevoláme
    }

    // Cleanup
    this._rockets = this._rockets.filter(r => r.active);
  }

  _aabb(a, b) {
    return (
      a.x < b.x + b.width  &&
      a.x + a.width  > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  /** Vrátí zbývající cooldown (0–5) pro HUD. */
  get cooldown() {
    return this._cooldown;
  }

  /** Vrátí max cooldown pro HUD. */
  get maxCooldown() {
    return ROCKET.COOLDOWN;
  }

  reset() {
    for (const r of this._rockets) r.remove();
    this._rockets      = [];
    this._cooldown     = 0;
    this._fireRequested = false;
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKeyDown);
  }
}
