'use strict';

/**
 * @file constants.js
 * Centrální konfigurace hry — veškerá čísla a výčty jsou definována zde.
 * Nikde jinde v kódu se nepoužívají magic numbers.
 */

// ─── Rozměry herní plochy ────────────────────────────────────────────────────

const CANVAS = Object.freeze({
  WIDTH:  400,
  HEIGHT: 711,   // 400 × (16/9) ≈ 711
});

// ─── Silnice a pruhy ─────────────────────────────────────────────────────────

const ROAD = Object.freeze({
  LANE_COUNT:       6,
  SHOULDER_WIDTH:   18,   // px — krajnice vlevo/vpravo
  LANE_LINE_WIDTH:  2,    // px — přerušovaná čára pruhu
  LANE_LINE_DASH:   40,   // px — délka čárky
  LANE_LINE_GAP:    30,   // px — mezera čárky
  SHOULDER_LINE_WIDTH: 3, // px — plná krajnicová čára
  SURFACE_COLOR:    '#3a3a3a',
  SHOULDER_COLOR:   '#2a2a2a',
  LANE_LINE_COLOR:  '#ffffff',
  SHOULDER_LINE_COLOR: '#e8c842',
});

/** Šířka jednoho jízdního pruhu v pixelech (vypočítáno z CANVAS a ROAD) */
const LANE_WIDTH = (CANVAS.WIDTH - ROAD.SHOULDER_WIDTH * 2) / ROAD.LANE_COUNT;

/** X souřadnice středů jednotlivých pruhů (index 0 = nejlevější) */
const LANE_CENTERS = Object.freeze(
  Array.from({ length: ROAD.LANE_COUNT }, (_, i) =>
    ROAD.SHOULDER_WIDTH + i * LANE_WIDTH + LANE_WIDTH / 2
  )
);

// ─── Fyzika / rychlost ───────────────────────────────────────────────────────

const PHYSICS = Object.freeze({
  /** Počáteční rychlost při startu hry (px/s) */
  SPEED_INITIAL:      290,
  /** Minimální rychlost — odpovídá 20 km/h zobrazených hráči (px/s) */
  SPEED_MIN:           75,
  /** Maximální rychlost — odpovídá 320 km/h zobrazených hráči (px/s) */
  SPEED_MAX:         1200,
  /** Akcelerace při držení ↑ (px/s²) */
  ACCELERATION:       340,
  /** Základní zpomalení při držení ↓ — první fáze brzdění (px/s²) */
  DECELERATION:       500,
  /**
   * Maximální zpomalení při plném brzdění — kvadratická fáze (px/s²).
   * Dosaženo po BRAKE_RAMPUP_TIME sekundách nepřetržitého brzdění.
   */
  DECELERATION_MAX:  1800,
  /**
   * Doba (s), po které začne brzdný účinek kvadraticky růst.
   * Do této doby se používá základní DECELERATION.
   */
  BRAKE_RAMPUP_START: 0.3,
  /**
   * Doba (s), za kterou brzdný účinek dosáhne DECELERATION_MAX.
   * (měřeno od BRAKE_RAMPUP_START)
   */
  BRAKE_RAMPUP_DURATION: 1.2,
  /** Přirozený odpor — pasivní pokles rychlosti bez vstupu (px/s²) */
  DRAG:                60,
  /**
   * Koeficient konverze px/s → km/h (vizuální).
   * Kalibrováno: SPEED_MAX (1200 px/s) = 320 km/h → 320/1200 ≈ 0.2667
   */
  PX_PER_S_TO_KMH:    0.2667,
  /**
   * Kolik herních px odpovídá 1 metru vzdálenosti.
   * Odvozeno z PX_PER_S_TO_KMH:
   *   1 px/s = PX_PER_S_TO_KMH km/h = PX_PER_S_TO_KMH × (1000/3600) m/s
   *   → 1 m = 1 / (PX_PER_S_TO_KMH × 1000/3600)  px/m ≈ 13.5 px/m
   */
  PX_PER_METER: 1 / (0.2667 * 1000 / 3600),
});

// ─── Hráčovo auto ────────────────────────────────────────────────────────────

const PLAYER = Object.freeze({
  WIDTH:       54,
  HEIGHT:      90,
  /** Y souřadnice středu auta (90 % výšky plátna) */
  Y_CENTER:    Math.round(CANVAS.HEIGHT * 0.88),
  START_LANE:  2,   // index pruhu (0–5), prostřední levý z dvojice 2/3
  COLOR_BODY:  '#27ae60',
  COLOR_ROOF:  '#1a7a42',
  COLOR_LIGHT_FRONT: '#ffffaa',
  COLOR_LIGHT_REAR:  '#cc0000',
  /** Hitbox je zmenšen na X % karoserie pro fair-play */
  HITBOX_FACTOR: 0.80,
});

// ─── Typy dopravních aut ─────────────────────────────────────────────────────

/** @enum {string} */
const VehicleType = Object.freeze({
  CAR:   'car',
  VAN:   'van',
  BUS:   'bus',
  TRUCK: 'truck',
});

/**
 * Definice každého typu vozidla.
 * speedFactor: násobitel základní rychlosti silnice (< 1 = pomalejší než hráč).
 * spawnWeight: relativní pravděpodobnost spawnu.
 */
const VEHICLE_DEFS = Object.freeze({
  [VehicleType.CAR]: {
    width:       38,
    height:      65,
    speedMin:    0.35,
    speedMax:    0.65,
    spawnWeight: 5,
    colors: ['#e74c3c', '#3498db', '#ecf0f1', '#95a5a6', '#f39c12', '#8e44ad'],
    roofColor:   null,   // null = vypočítá se ztmavením těla
  },
  [VehicleType.VAN]: {
    width:       42,
    height:      90,
    speedMin:    0.30,
    speedMax:    0.55,
    spawnWeight: 3,
    colors: ['#ecf0f1', '#f1c40f', '#95a5a6', '#e67e22'],
    roofColor:   null,
  },
  [VehicleType.BUS]: {
    width:       44,
    height:     130,
    speedMin:    0.25,
    speedMax:    0.45,
    spawnWeight: 1,
    colors: ['#e67e22', '#f1c40f', '#27ae60'],
    roofColor:   null,
  },
  [VehicleType.TRUCK]: {
    width:       44,
    height:     150,
    speedMin:    0.20,
    speedMax:    0.40,
    spawnWeight: 1,
    colors: ['#2c3e50', '#27ae60', '#7f8c8d', '#c0392b'],
    roofColor:   null,
  },
});

/** Pole typů vozidel, kde každý je zastoupen dle spawnWeight */
const VEHICLE_SPAWN_POOL = Object.freeze(
  Object.entries(VEHICLE_DEFS).flatMap(([type, def]) =>
    Array(def.spawnWeight).fill(type)
  )
);

// ─── Spawn ───────────────────────────────────────────────────────────────────

const SPAWN = Object.freeze({
  /** Základní interval spawnu v sekundách */
  INTERVAL_BASE:   1.5,
  /** Minimální interval spawnu (s) */
  INTERVAL_MIN:    0.6,
  /** O kolik se zkrátí interval na každých 100 px/s nad počáteční rychlost */
  INTERVAL_STEP:   0.1,
  /** Pravděpodobnost spawnu mince místo auta (0–1) */
  COIN_CHANCE:     0.18,
  /** Bezpečná Y vzdálenost pro nový spawn (aby se objekty nepřekrývaly) */
  SAFE_GAP:        20,
  /**
   * Násobitel výšky předního auta — pokud je mezera mezi auty menší než
   * (výška předního auta × FOLLOW_GAP_FACTOR), zadní přizpůsobí rychlost.
   */
  FOLLOW_GAP_FACTOR: 0.5,
});

// ─── Mince ───────────────────────────────────────────────────────────────────

const COIN = Object.freeze({
  RADIUS:       12,
  COLOR_FILL:   '#FFD700',
  COLOR_STROKE: '#cc9900',
  STROKE_WIDTH:  2,
  INNER_RADIUS:  7,
  INNER_COLOR:  '#ffec6e',
  SCORE_VALUE:   5,
});

// ─── Skóre ───────────────────────────────────────────────────────────────────

const SCORE = Object.freeze({
  COIN_BONUS: 5,
});

// ─── Policejní auto ──────────────────────────────────────────────────────────

const POLICE = Object.freeze({
  /** Rozměry karoserie — stejná třída jako osobní auto */
  WIDTH:  38,
  HEIGHT: 65,

  /** Rychlostní faktor — policie jede pomaleji než hráč */
  SPEED_FACTOR_MIN: 0.30,
  SPEED_FACTOR_MAX: 0.55,

  /** Spawn váha v celkovém traffic poolu */
  SPAWN_WEIGHT: 1,

  /** Barvy karoserie (bílo-modrá kombinace) */
  COLOR_BODY_WHITE: '#f0f0f0',
  COLOR_BODY_BLUE:  '#1a4fa0',
  COLOR_ROOF:       '#0d2d5e',
  COLOR_LIGHT_BAR:  '#1565c0',

  /**
   * Poloměr "radaru" — zóna zachycení kolem policejního auta.
   * Krytí 2 pruhů na každou stranu → průměr = 4 × LANE_WIDTH → r = 2 × LANE_WIDTH.
   * Hodnota se dopočítává dynamicky v policeCar.js z LANE_WIDTH.
   */
  RADAR_OPACITY:      0.45,
  RADAR_COLOR:        '#5bb8ff',
  RADAR_STROKE:       '#2196f3',
  RADAR_STROKE_WIDTH:  1.5,

  /**
   * Rychlostní limit pro chycení v km/h.
   * Hráč je BUSTED pouze pokud vstoupí do radaru při rychlosti > tohoto limitu.
   */
  SPEED_LIMIT_KMH: 100,

  /** Amplituda pulzování poloměru radaru (px) */
  PULSE_AMPLITUDE: 6,
  /** Frekvence pulzování (Hz) */
  PULSE_FREQUENCY: 1.2,
});

// ─── Animace hráčova auta ────────────────────────────────────────────────────

const PLAYER_ANIM = Object.freeze({
  /**
   * Doba přejezdu jednoho pruhu v sekundách.
   * Pocit reálného auta: krátký ale plynulý přejezd.
   */
  LANE_CHANGE_DURATION: 0.28,

  /**
   * Maximální úhel natočení karoserie ve stupních při přejezdu.
   * Simuluje náklon / zatočení volantu.
   */
  MAX_TILT_DEG: 14,

  /**
   * Exponent easing křivky (ease-in-out).
   * 2 = kvadratická, 3 = kubická (výraznější nástup/dojezd).
   */
  EASE_POWER: 3,
});

// ─── Animace pruhu (dashed lines) ────────────────────────────────────────────

const LANE_ANIM = Object.freeze({
  /** Celková délka jednoho dash+gap cyklu */
  CYCLE: ROAD.LANE_LINE_DASH + ROAD.LANE_LINE_GAP,
});

// ─── Audio — zvukový engine motoru ───────────────────────────────────────────

const AUDIO = Object.freeze({
  /** Maximální RPM motoru */
  RPM_MAX:           8000,
  /** RPM při přeřazení nahoru */
  RPM_SHIFT_UP:      7200,
  /** RPM po přeřazení nahoru (nový stupeň začíná zde) */
  RPM_SHIFT_DOWN:    3200,
  /** Počet rychlostních stupňů */
  GEAR_COUNT:        6,
  /**
   * Hranice rychlostních stupňů v px/s (odvozeno z km/h přes PX_PER_S_TO_KMH).
   * Stupeň 1: 0–225, 2: 225–450, 3: 450–675, 4: 675–975, 5: 975–1200, 6: 1200+
   * km/h:      0–60,  60–120,    120–180,    180–260,    260–320
   */
  GEAR_THRESHOLDS:   Object.freeze([0, 225, 450, 675, 975, 1200]),
  /** Minimální playbackRate (při RPM = 0) */
  PITCH_MIN:         0.6,
  /** Maximální playbackRate (při RPM = RPM_MAX) */
  PITCH_MAX:         2.0,
  /** Inerce RPM — lerp faktor za sekundu (vyšší = rychlejší odezva) */
  RPM_LERP:          4.0,
  /** Hodnota n (rpm/RPM_MAX) pro 1. turbo one-shot (low→mid) */
  TURBO_THRESHOLD_1: 0.35,
  /** Hodnota n (rpm/RPM_MAX) pro 2. turbo one-shot (mid→high) */
  TURBO_THRESHOLD_2: 0.70,
  /** Minimální n pro spuštění blowoff (při puštění plynu) */
  BLOWOFF_MIN_N:     0.55,
  /** Maximální hlasitost turbo loopu */
  TURBO_VOLUME:      0.45,
  /** Hlasitost blowoff one-shotu */
  BLOWOFF_VOLUME:    0.65,
  /** Hlasitost master gain (engine vrstvy) */
  MASTER_VOLUME:     0.8,
  /** Délka fade-out při zastavení enginu (s) */
  FADE_OUT_TIME:     0.4,
  /** Minimální doba držení plynu (s) pro spuštění turbo one-shotu */
  TURBO_THROTTLE_MIN: 1.0,
});
