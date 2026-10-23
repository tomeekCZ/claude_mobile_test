# GPS Speedometer

A mobile web app (PWA) that shows your current driving speed from GPS. You can install it to the home screen, and once loaded it also works offline.

## Features

- **Speed** in km/h or mph (tap the unit to switch)
- **Speed sources**
  - **GPS Doppler speed** (`coords.speed`): the primary source and the most precise
  - **Position-derived speed** (distance ÷ time between fixes): used as a fallback when the device gives no Doppler speed (e.g. iOS reports `-1`)
- **Kalman filter** smooths the speed: it trusts precise readings and damps noisy outliers
- **Standstill dead-band**: shows 0 below ~1.8 km/h, so GPS jitter doesn't show speed while you are parked
- **Heading** (compass + degrees), **altitude**, **GPS accuracy** indicator
- **Trip stats**: max, average (moving), distance, moving time
- **GPS signal lost** warning after 5 s without a fix (tunnels, garages)
- **Screen stays on** (Wake Lock API)
- **HUD mode**: a mirrored display you can reflect off the windshield at night

## Run it

Browsers allow GPS only over **HTTPS** (or `localhost`).

| Where | How |
|---|---|
| Local PC | `npm start` → open http://localhost:8080 |
| Phone | Host it on any HTTPS static host (e.g. GitHub Pages: *Settings → Pages → Deploy from branch*), open the URL, then *Add to Home screen* |

## Tests

```bash
npm test   # unit tests for js/speed.js (Node built-in test runner, no dependencies)
```

## Structure

```
index.html            UI
css/style.css         styles (dark, large digits, HUD mode)
js/speed.js           pure logic: haversine, Kalman filter, trip stats, formatting
js/app.js             geolocation, wake lock, rendering
sw.js                 offline cache
manifest.webmanifest  PWA install metadata
tests/                unit tests
```

## Limits

- Accuracy depends on the phone's GPS chip and the sky view. Expect ±1–2 km/h at a steady speed.
- After a tunnel, readings take a few seconds to recover.
- Accelerometer and gyroscope are **not** used for speed. Without a fixed phone mount and calibration they drift too much to help.
- Do not use the app instead of the car's speedometer. Don't operate the phone while driving.
