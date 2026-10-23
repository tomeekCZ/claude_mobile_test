// Pure speed/navigation logic. No DOM access, so it can be unit-tested in Node.

export const KMH_PER_MS = 3.6;
export const MPH_PER_MS = 2.2369363;
const EARTH_RADIUS_M = 6371008.8;

// Below this speed (m/s, ~1.8 km/h) we show 0 — GPS jitters while standing still.
export const STANDSTILL_MS = 0.5;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two {latitude, longitude} points. */
export function haversine(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees (0 = north, clockwise) from a to b. */
export function bearing(a, b) {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Turn a raw GPS fix into a speed measurement { speed (m/s), variance, source }.
 * Prefers the receiver's Doppler speed (coords.speed); falls back to distance / time
 * between the previous and current fix. Returns null if no usable measurement.
 */
export function measureSpeed(prev, cur) {
  const { speed, accuracy } = cur.coords;
  if (Number.isFinite(speed) && speed >= 0) {
    // Doppler speed is much more precise than position; the browser gives no
    // speed accuracy, so derive a heuristic sigma from position accuracy.
    const sigma = Math.max(0.3, (accuracy ?? 10) / 20);
    return { speed, variance: sigma ** 2, source: 'doppler' };
  }
  if (!prev) return null;
  const dt = (cur.timestamp - prev.timestamp) / 1000;
  if (!(dt > 0.2)) return null;
  const dist = haversine(prev.coords, cur.coords);
  // Error of a difference of two positions, spread over dt.
  const sigma = Math.max(0.5, (Math.hypot(prev.coords.accuracy ?? 10, accuracy ?? 10)) / dt);
  return { speed: dist / dt, variance: sigma ** 2, source: 'position' };
}

/**
 * 1-D Kalman filter for speed. Model: speed is a random walk driven by
 * acceleration noise `accelSigma` (m/s²); measurements come with their own variance.
 */
export class SpeedFilter {
  constructor({ accelSigma = 2.5 } = {}) {
    this.accelSigma = accelSigma;
    this.reset();
  }

  reset() {
    this.speed = null;
    this.variance = null;
    this.time = null;
  }

  /** Feed a measurement taken at time t (ms). Returns the filtered speed in m/s. */
  update({ speed, variance }, t) {
    if (this.speed === null) {
      this.speed = speed;
      this.variance = variance;
      this.time = t;
      return speed;
    }
    const dt = Math.max(0, (t - this.time) / 1000);
    this.time = t;
    // Predict: uncertainty grows with time since the last fix.
    const p = this.variance + (this.accelSigma * dt) ** 2;
    // Correct.
    const k = p / (p + variance);
    this.speed = Math.max(0, this.speed + k * (speed - this.speed));
    this.variance = (1 - k) * p;
    return this.speed;
  }
}

/** Accumulates trip statistics from filtered speed samples. */
export class TripStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.distance = 0; // m
    this.maxSpeed = 0; // m/s
    this.movingTime = 0; // ms
    this.lastTime = null;
  }

  /** Add a filtered speed sample at time t (ms). Distance is integrated from speed,
   *  which avoids "phantom" distance from position jitter while parked. */
  add(speed, t) {
    if (this.lastTime !== null) {
      const dtMs = t - this.lastTime;
      // Ignore long gaps (tunnel, app in background) instead of extrapolating.
      if (dtMs > 0 && dtMs < 10000 && speed >= STANDSTILL_MS) {
        this.distance += (speed * dtMs) / 1000;
        this.movingTime += dtMs;
      }
    }
    this.lastTime = t;
    if (speed > this.maxSpeed) this.maxSpeed = speed;
  }

  /** Average speed while moving, in m/s. */
  get avgSpeed() {
    return this.movingTime > 0 ? this.distance / (this.movingTime / 1000) : 0;
  }
}

/** Convert m/s to the display unit and apply the standstill dead-band. */
export function toDisplaySpeed(ms, unit) {
  if (!Number.isFinite(ms) || ms < STANDSTILL_MS) return 0;
  return Math.round(ms * (unit === 'mph' ? MPH_PER_MS : KMH_PER_MS));
}

export function toDisplayDistance(m, unit) {
  return unit === 'mph' ? m / 1609.344 : m / 1000;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function headingToCompass(deg) {
  if (!Number.isFinite(deg)) return '—';
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
