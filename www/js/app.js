import {
  SpeedFilter,
  TripStats,
  measureSpeed,
  bearing,
  haversine,
  headingToCompass,
  toDisplaySpeed,
  toDisplayDistance,
  formatDuration,
  STANDSTILL_MS,
} from './speed.js';

const $ = (id) => document.getElementById(id);
const ui = {
  dot: $('gps-dot'),
  status: $('gps-status'),
  accuracy: $('accuracy'),
  speed: $('speed'),
  unit: $('unit'),
  heading: $('heading'),
  ring: $('ring-fg'),
  max: $('max'),
  avg: $('avg'),
  dist: $('dist'),
  time: $('time'),
  alt: $('alt'),
  source: $('source'),
  start: $('start'),
  reset: $('reset'),
  hud: $('hud'),
  error: $('error'),
};

const GAUGE_MAX = { kmh: 200, mph: 120 };
const STALE_AFTER_MS = 5000;

const filter = new SpeedFilter();
const trip = new TripStats();
let unit = loadSetting('unit', 'kmh');
let watchId = null;
let wakeLock = null;
let prevFix = null;
let lastFixAt = 0;
let lastHeading = NaN;
let speedMs = 0;

function loadSetting(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function onPosition(pos) {
  lastFixAt = Date.now();
  const m = measureSpeed(prevFix, pos);
  if (m) {
    speedMs = filter.update(m, pos.timestamp);
    trip.add(speedMs, pos.timestamp);
    ui.source.textContent = m.source === 'doppler' ? 'GPS' : 'Pos';
  }

  // Heading: receiver value when moving, else computed from the last two fixes.
  const { heading, accuracy, altitude } = pos.coords;
  if (Number.isFinite(heading) && speedMs >= STANDSTILL_MS) {
    lastHeading = heading;
  } else if (prevFix && speedMs >= STANDSTILL_MS && haversine(prevFix.coords, pos.coords) > accuracy) {
    lastHeading = bearing(prevFix.coords, pos.coords);
  }

  prevFix = pos;
  setGpsQuality(accuracy);
  ui.alt.textContent = Number.isFinite(altitude) ? `${Math.round(altitude)} m` : '—';
  render();
}

function onError(err) {
  const messages = {
    1: 'Location permission denied. Allow it in browser settings.',
    2: 'Position unavailable. Go outside / check that GPS is on.',
    3: 'Waiting for GPS signal…',
  };
  showError(messages[err.code] ?? err.message);
  if (err.code === 1) stop();
}

function setGpsQuality(accuracy) {
  ui.error.hidden = true;
  const cls = accuracy <= 10 ? 'good' : accuracy <= 30 ? 'fair' : 'bad';
  ui.dot.className = `dot ${cls}`;
  ui.status.textContent = { good: 'GPS good', fair: 'GPS fair', bad: 'GPS weak' }[cls];
  ui.accuracy.textContent = `±${Math.round(accuracy)} m`;
}

function render() {
  const shown = toDisplaySpeed(speedMs, unit);
  const label = unit === 'mph' ? 'mph' : 'km/h';
  ui.speed.textContent = shown;
  ui.unit.textContent = label;
  ui.ring.style.strokeDasharray = `${Math.min(1, shown / GAUGE_MAX[unit]) * 75} 100`;
  ui.heading.textContent = Number.isFinite(lastHeading)
    ? `${headingToCompass(lastHeading)} ${Math.round(lastHeading)}°`
    : '—';
  ui.max.textContent = toDisplaySpeed(trip.maxSpeed, unit);
  ui.avg.textContent = toDisplaySpeed(trip.avgSpeed, unit);
  ui.dist.textContent = toDisplayDistance(trip.distance, unit).toFixed(2);
  ui.time.textContent = formatDuration(trip.movingTime);
}

function showError(msg) {
  ui.error.textContent = msg;
  ui.error.hidden = false;
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* not supported or denied — screen may dim */ }
}

function start() {
  if (!('geolocation' in navigator)) {
    showError('This browser has no geolocation support.');
    return;
  }
  if (!window.isSecureContext) {
    showError('GPS needs HTTPS (or localhost). Open the app over https://');
    return;
  }
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  });
  requestWakeLock();
  ui.start.textContent = 'Stop';
  ui.status.textContent = 'Searching GPS…';
}

function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  prevFix = null;
  filter.reset();
  speedMs = 0;
  lastHeading = NaN;
  trip.lastTime = null;
  ui.alt.textContent = '—';
  ui.source.textContent = '—';
  ui.start.textContent = 'Start';
  ui.dot.className = 'dot';
  ui.status.textContent = 'GPS off';
  ui.accuracy.textContent = '';
  render();
}

ui.start.addEventListener('click', () => (watchId === null ? start() : stop()));
ui.reset.addEventListener('click', () => {
  trip.reset();
  render();
});
ui.unit.addEventListener('click', () => {
  unit = unit === 'kmh' ? 'mph' : 'kmh';
  saveSetting('unit', unit);
  render();
});
ui.hud.addEventListener('click', () => {
  ui.hud.classList.toggle('active', document.body.classList.toggle('hud'));
});

// Wake lock is dropped when the tab is hidden; take it again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && watchId !== null) requestWakeLock();
});

// Flag a lost signal (tunnel, garage) instead of freezing on the last speed.
setInterval(() => {
  if (watchId !== null && lastFixAt && Date.now() - lastFixAt > STALE_AFTER_MS) {
    ui.dot.className = 'dot bad';
    ui.status.textContent = 'GPS signal lost';
  }
}, 1000);

// The Android app ships its files inside the APK, so it needs no offline cache.
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform()) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
