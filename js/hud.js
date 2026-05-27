'use strict';

/**
 * @file hud.js
 * Aktualizuje DOM elementy HUD overlaye a overlay panely (start / game over).
 */

class Hud {
  constructor() {
    // HUD hodnoty
    this._elScore    = document.getElementById('hud-score-value');
    this._elDistance = document.getElementById('hud-distance-value');
    this._elSpeed    = document.getElementById('hud-speed-value');

    // Overlay panel
    this._overlay        = document.getElementById('overlay');
    this._overlayTitle   = document.getElementById('overlay-title');
    this._overlayStats   = document.getElementById('overlay-stats');
    this._overlaySubtitle = document.getElementById('overlay-subtitle');
    this._btnStart       = document.getElementById('btn-start');
    this._btnClose       = document.getElementById('btn-close');

    // Výsledky
    this._elResultScore    = document.getElementById('result-score');
    this._elResultDistance = document.getElementById('result-distance');
    this._elResultCoins    = document.getElementById('result-coins');

    // Raketomet HUD
    this._elRocket  = document.getElementById('hud-rocket');
    this._rocketBar = document.getElementById('hud-rocket-bar');
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────

  /**
   * Aktualizuje zobrazené hodnoty v HUD.
   * @param {number} score        - Celkové skóre.
   * @param {number} distanceMeters - Vzdálenost v metrech.
   * @param {number} speedPxPerS  - Rychlost silnice v px/s.
   */
  update(score, distanceMeters, speedPxPerS, rocketCooldown = 0, rocketMax = 5) {
    this._elScore.textContent    = score;
    this._elDistance.textContent = `${distanceMeters} m`;
    this._elSpeed.textContent    = `${Math.round(speedPxPerS * PHYSICS.PX_PER_S_TO_KMH)} km/h`;

    // Cooldown raketometu
    if (this._elRocket) {
      const ready = rocketCooldown <= 0;
      if (ready) {
        this._elRocket.textContent = '🚀 PŘIPRAVEN';
        this._elRocket.style.color  = '#00e676';
        this._elRocket.style.opacity = '1';
        this._rocketBar.style.width  = '100%';
        this._rocketBar.style.background = '#00e676';
      } else {
        const pct = Math.round((1 - rocketCooldown / rocketMax) * 100);
        this._elRocket.textContent = `🚀 ${rocketCooldown.toFixed(1)}s`;
        this._elRocket.style.color  = '#ff9800';
        this._elRocket.style.opacity = '0.9';
        this._rocketBar.style.width  = `${pct}%`;
        this._rocketBar.style.background = '#ff9800';
      }
    }
  }

  // ─── Overlay ─────────────────────────────────────────────────────────────────

  /**
   * Zobrazí úvodní (start) overlay.
   */
  showStart() {
    this._overlayTitle.textContent    = 'STREET RACER';
    this._overlayTitle.style.color    = '#e94560';
    this._overlayTitle.style.textShadow = '0 0 20px rgba(233, 69, 96, 0.6)';
    this._overlaySubtitle.textContent = 'Vyhýbej se autům a sbírej mince!';
    this._overlayStats.classList.add('hidden');
    this._btnStart.textContent = 'HRÁT';
    this._btnClose.classList.add('hidden');
    this._overlay.classList.remove('hidden');
  }

  /**
   * Zobrazí game-over overlay s výsledky.
   * @param {number}  score
   * @param {number}  distanceMeters
   * @param {number}  coins
   * @param {boolean} [busted=false]      - true = BUSTED (policie), false = CRASH
   * @param {number}  [bustedSpeedKmh=0]  - Rychlost při chycení (km/h), jen pro BUSTED
   */
  showGameOver(score, distanceMeters, coins, busted = false, bustedSpeedKmh = 0) {
    this._overlayTitle.textContent = busted ? 'BUSTED!' : 'GAME OVER';
    this._overlayTitle.style.color = busted ? '#1a8cff' : '#e94560';
    this._overlayTitle.style.textShadow = busted
      ? '0 0 20px rgba(26, 140, 255, 0.7)'
      : '0 0 20px rgba(233, 69, 96, 0.6)';

    if (busted) {
      this._overlaySubtitle.innerHTML =
        `Byl jsi chycen policií!<br>` +
        `<span class="busted-speed">${Math.round(bustedSpeedKmh)} km/h</span>`;
    } else {
      this._overlaySubtitle.textContent = 'Dobrá jízda! Zkus to znovu.';
    }

    this._elResultScore.textContent    = score;
    this._elResultDistance.textContent = `${distanceMeters} m`;
    this._elResultCoins.textContent    = coins;

    this._overlayStats.classList.remove('hidden');
    this._btnStart.textContent = 'HRÁT ZNOVU';
    this._btnClose.classList.remove('hidden');
    this._overlay.classList.remove('hidden');
  }

  /**
   * Skryje overlay.
   */
  hideOverlay() {
    this._overlay.classList.add('hidden');
  }

  /**
   * Zaregistruje handler pro tlačítko start/restart.
   * @param {Function} callback
   */
  onStartClick(callback) {
    this._btnStart.addEventListener('click', callback);
  }

  /**
   * Zaregistruje handler pro tlačítko "Zpět na úvod".
   * @param {Function} callback
   */
  onCloseClick(callback) {
    this._btnClose.addEventListener('click', callback);
  }
}
