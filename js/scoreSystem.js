'use strict';

/**
 * @file scoreSystem.js
 * Uchovává a počítá herní skóre:
 *  - Vzdálenost (px → metry)
 *  - Počet sebraných mincí
 *  - Výsledné skóre = vzdálenost [m] + (počty mincí × COIN_BONUS)
 */

class ScoreSystem {
  constructor() {
    /** @private — akumulovaný posun silnice v px */
    this._distancePx = 0;

    /** @private */
    this._coinCount  = 0;
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Přičte ujetou vzdálenost za jeden frame.
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Rychlost silnice (px/s).
   */
  addDistance(dt, roadSpeed) {
    this._distancePx += roadSpeed * dt;
  }

  /**
   * Přičte sebrané mince.
   * @param {number} count - Počet sebraných mincí v tomto framu.
   */
  addCoins(count) {
    this._coinCount += count;
  }

  /**
   * Vzdálenost v metrech (zaokrouhleno na celé číslo).
   * @returns {number}
   */
  get distanceMeters() {
    return Math.floor(this._distancePx / PHYSICS.PX_PER_METER);
  }

  /**
   * Počet sebraných mincí.
   * @returns {number}
   */
  get coinCount() {
    return this._coinCount;
  }

  /**
   * Výsledné skóre = vzdálenost [m] + mince × bonus.
   * @returns {number}
   */
  get totalScore() {
    return this.distanceMeters + this._coinCount * SCORE.COIN_BONUS;
  }

  /**
   * Resetuje vše na nulu.
   */
  reset() {
    this._distancePx = 0;
    this._coinCount  = 0;
  }
}
