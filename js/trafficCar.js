'use strict';

/**
 * @file trafficCar.js
 * Jedno dopravní vozidlo — SVG grafika, pohyb dolů po obrazovce, hitbox.
 *
 * Každé auto je kresleno relativně k vlastnímu středu [0,0].
 * Pohyb je řízen pozicí středu Y (cy), která se aktualizuje každý frame.
 */

class TrafficCar {
  /**
   * @param {SVGElement} svg        - Kořenový SVG element.
   * @param {string}     type       - Typ vozidla (VehicleType).
   * @param {number}     laneIndex  - Index pruhu (0–5).
   * @param {number}     startY     - Počáteční Y střed vozidla (mimo obrazovku nahoře).
   * @param {number}     roadSpeed  - Aktuální rychlost silnice px/s (při spawnu).
   */
  constructor(svg, type, laneIndex, startY, roadSpeed) {
    /** @private */
    this._svg = svg;

    /** @type {string} */
    this.type = type;

    /** @private */
    this._def = VEHICLE_DEFS[type];

    /** Index pruhu (0–5), veřejný pro spawn logiku. */
    this.laneIndex = laneIndex;

    /** @private — X střed (vždy střed pruhu) */
    this._cx = LANE_CENTERS[laneIndex];

    /** @private — Y střed (pohybuje se dolů) */
    this._cy = startY;

    /** @private — vlastní rychlost pohybu dolů v px/s */
    this._speed = this._calcSpeed(roadSpeed);

    /** @private — SVG skupina */
    this._group = null;

    /** Příznak, zda je vozidlo aktivní (false = má být odstraněno). */
    this.active = true;

    this._createElements();
  }

  // ─── Privátní — výpočty ─────────────────────────────────────────────────────

  /**
   * Vypočítá absolutní rychlost vozidla na základě roadSpeed a speedFactor definice.
   * Vozidlo je vždy pomalejší než hráč (pohybuje se dolů pomalejší rychlostí).
   * @private
   * @param {number} roadSpeed
   * @returns {number}
   */
  _calcSpeed(roadSpeed) {
    const { speedMin, speedMax } = this._def;
    const factor = speedMin + Math.random() * (speedMax - speedMin);
    return roadSpeed * factor;
  }

  // ─── Privátní — SVG ─────────────────────────────────────────────────────────

  /**
   * Vytvoří SVG prvky dle typu vozidla a připojí skupinu do SVG.
   * @private
   */
  _createElements() {
    const g = this._createElement('g');
    const def = this._def;
    const hw = def.width  / 2;
    const hh = def.height / 2;
    const color = def.colors[Math.floor(Math.random() * def.colors.length)];
    const roofColor = this._darkenColor(color, 0.7);

    // Karoserie
    const body = this._createRect(-hw, -hh, def.width, def.height, color, 3);
    g.appendChild(body);

    // Střecha (závisí na typu)
    this._addRoof(g, hw, hh, roofColor);

    // Světla přední (nahoře z pohledu hráče = jedou od hráče)
    this._addLights(g, hw, hh);

    this._group = g;
    this._svg.appendChild(g);
    this._applyTransform();
  }

  /**
   * Přidá střechu vozidla — pro každý typ jiná proporce.
   * @private
   */
  _addRoof(g, hw, hh, roofColor) {
    const def = this._def;

    switch (this.type) {
      case VehicleType.CAR: {
        const rw = def.width  * 0.65;
        const rh = def.height * 0.38;
        g.appendChild(this._createRect(-rw / 2, -hh + def.height * 0.22, rw, rh, roofColor, 3));
        break;
      }
      case VehicleType.VAN: {
        // Dodávka — téměř celé vozidlo je rovná kabina
        const rw = def.width  * 0.88;
        const rh = def.height * 0.55;
        g.appendChild(this._createRect(-rw / 2, -hh + def.height * 0.04, rw, rh, roofColor, 2));
        break;
      }
      case VehicleType.BUS: {
        // Autobus — plochá střecha přes celou šířku
        const rw = def.width  * 0.92;
        const rh = def.height * 0.82;
        g.appendChild(this._createRect(-rw / 2, -hh + def.height * 0.05, rw, rh, roofColor, 1));
        // Okna autobusu (3 řady)
        this._addBusWindows(g, hw, hh);
        break;
      }
      case VehicleType.TRUCK: {
        // Kabina vpředu (nahoře), nákladní část vzadu
        const cabH = def.height * 0.30;
        const cabW = def.width  * 0.90;
        g.appendChild(this._createRect(-cabW / 2, -hh + 4, cabW, cabH, roofColor, 2));
        // Nákladní část
        const cargoH = def.height * 0.55;
        const cargoColor = this._darkenColor(roofColor, 0.85);
        g.appendChild(this._createRect(-hw + 2, -hh + cabH + 8, def.width - 4, cargoH, cargoColor, 1));
        break;
      }
    }
  }

  /**
   * Přidá okna autobusu.
   * @private
   */
  _addBusWindows(g, hw, hh) {
    const winW = 8;
    const winH = 12;
    const winColor = '#a8d8f0';
    const rows = 3;
    const startY = -hh + 14;
    const gapY = 22;

    for (let row = 0; row < rows; row++) {
      // levé okno
      g.appendChild(this._createRect(-hw + 5, startY + row * gapY, winW, winH, winColor, 1));
      // pravé okno
      g.appendChild(this._createRect(hw - winW - 5, startY + row * gapY, winW, winH, winColor, 1));
    }
  }

  /**
   * Přidá přední a zadní světla.
   * @private
   */
  _addLights(g, hw, hh) {
    const lw = 7;
    const lh = 4;

    // Přední (horní kraj — auto jede směrem od hráče)
    g.appendChild(this._createRect(-hw + 3,      -hh + 3, lw, lh, '#ffffaa', 1));
    g.appendChild(this._createRect(hw - lw - 3, -hh + 3, lw, lh, '#ffffaa', 1));
    // Zadní (dolní kraj)
    g.appendChild(this._createRect(-hw + 3,      hh - lh - 3, lw, lh, '#ff4444', 1));
    g.appendChild(this._createRect(hw - lw - 3, hh - lh - 3, lw, lh, '#ff4444', 1));
  }

  /** @private */
  _createElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  /** @private */
  _createRect(x, y, w, h, fill, rx = 0) {
    const rect = this._createElement('rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', fill);
    if (rx > 0) rect.setAttribute('rx', rx);
    return rect;
  }

  /** @private */
  _applyTransform() {
    this._group.setAttribute('transform', `translate(${this._cx}, ${this._cy})`);
  }

  /**
   * Ztmaví hex barvu násobením složek.
   * @private
   * @param {string} hex    - Barva ve formátu '#rrggbb'.
   * @param {number} factor - 0–1, 1 = nezměněno.
   * @returns {string}
   */
  _darkenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const d = (v) => Math.max(0, Math.round(v * factor)).toString(16).padStart(2, '0');
    return `#${d(r)}${d(g)}${d(b)}`;
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje pozici vozidla každý frame.
   * Relativní rychlost = road speed - vlastní speed vozidla
   * (vozidlo vypadá jako by šlo pomaleji než silnice).
   *
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Aktuální rychlost silnice (px/s).
   */
  update(dt, roadSpeed) {
    // Efektivní posun dolů = rozdíl silnice a vlastní rychlosti
    const relativeSpeed = roadSpeed - this._speed;
    this._cy += relativeSpeed * dt;
    this._applyTransform();

    // Deaktivuj, jakmile opustí spodní okraj s rezervou
    if (this._cy - this._def.height / 2 > CANVAS.HEIGHT + 20) {
      this.active = false;
    }
  }

  /**
   * Vrátí AABB hitbox ve světových souřadnicích.
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getHitbox() {
    const hw = this._def.width  / 2;
    const hh = this._def.height / 2;
    return {
      x:      this._cx - hw,
      y:      this._cy - hh,
      width:  this._def.width,
      height: this._def.height,
    };
  }

  /**
   * Vrátí aktuální Y střed vozidla (pro spawn kolizní kontrolu).
   * @returns {number}
   */
  get cy() {
    return this._cy;
  }

  /**
   * Vrátí vlastní rychlost vozidla (px/s).
   * @returns {number}
   */
  get speed() {
    return this._speed;
  }

  /**
   * Přizpůsobí vlastní rychlost na rychlost předního vozidla.
   * Volá se z TrafficManager, když je zadní auto příliš blízko předního.
   * @param {number} leaderSpeed - Rychlost auta vpředu (px/s).
   */
  matchSpeed(leaderSpeed) {
    this._speed = leaderSpeed;
  }

  /**
   * Vrátí výšku vozidla.
   * @returns {number}
   */
  get height() {
    return this._def.height;
  }

  /**
   * Odstraní SVG skupinu z dokumentu.
   */
  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
