'use strict';

/**
 * @file coinManager.js
 * Řídí spawn a životní cyklus zlatých mincí.
 *
 * Mince se generují nezávisle na autech — vlastní spawn timer.
 * Každá mince se vždy spawne do pruhu, který není obsazený autem blízko spawnu.
 */

class CoinManager {
  /**
   * @param {SVGElement}     svg            - Kořenový SVG element.
   * @param {TrafficManager} trafficManager - Reference na správce dopravy (pro kontrolu pruhů).
   */
  constructor(svg, trafficManager) {
    /** @private */
    this._svg = svg;

    /** @private */
    this._trafficManager = trafficManager;

    /**
     * Aktivní mince na scéně.
     * @type {Coin[]}
     */
    this._coins = [];

    /** @private — spawn timer (s) */
    this._spawnTimer = this._initialDelay();
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /**
   * Náhodný počáteční delay spawnu (aby mince nebyly hned při startu).
   * @private
   * @returns {number}
   */
  _initialDelay() {
    return 2.5 + Math.random() * 2;
  }

  /**
   * Vypočítá spawn interval mincí. Mince se generují méně často než auta.
   * @private
   * @param {number} speed
   * @returns {number}
   */
  _calcSpawnInterval(speed) {
    // Mince každé 3–5 sekund, zkracuje se s rychlostí
    const base = 4.0;
    const speedDelta = (speed - PHYSICS.SPEED_INITIAL) / 100;
    return Math.max(2.0, base - speedDelta * 0.15);
  }

  /**
   * Vrátí pruhy, které nejsou obsazeny autem blízko horního okraje.
   * @private
   * @returns {number[]}
   */
  _getAvailableLanes() {
    const safeZone = COIN.RADIUS * 2 + SPAWN.SAFE_GAP;
    const cars = this._trafficManager.getCars();

    const occupiedLanes = new Set(
      cars
        .filter(car => car.cy - car.height / 2 < safeZone + 60)
        .map(car => car.laneIndex)
        .filter(i => i !== -1)
    );

    return Array.from({ length: ROAD.LANE_COUNT }, (_, i) => i)
      .filter(i => !occupiedLanes.has(i));
  }

  /**
   * Spawnuje novou minci do náhodného volného pruhu.
   * @private
   */
  _spawnCoin() {
    const available = this._getAvailableLanes();
    if (available.length === 0) return;

    const laneIndex = available[Math.floor(Math.random() * available.length)];
    const startY    = -(COIN.RADIUS) - 5;
    const coin      = new Coin(this._svg, laneIndex, startY);
    this._coins.push(coin);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje mince každý frame.
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Aktuální rychlost silnice (px/s).
   */
  update(dt, roadSpeed) {
    for (const coin of this._coins) {
      coin.update(dt, roadSpeed);
    }

    // Odstranění neaktivních (mimo plátno nebo sebrané)
    this._coins = this._coins.filter(c => c.active);

    // Spawn timer
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = this._calcSpawnInterval(roadSpeed);
      this._spawnCoin();
    }
  }

  /**
   * Vrátí všechny aktivní mince (pro kolizní detekci).
   * @returns {Coin[]}
   */
  getCoins() {
    return this._coins;
  }

  /**
   * Resetuje správce mincí.
   */
  reset() {
    for (const coin of this._coins) coin.remove();
    this._coins = [];
    this._spawnTimer = this._initialDelay();
  }
}
