# GPS Speedometer

Shows your current driving speed from GPS. It comes in two forms:

- **Android app (APK)**: all files are inside the app, so it needs no internet. Built with [Capacitor](https://capacitorjs.com).
- **Web app (PWA)**: runs in any phone browser over HTTPS.

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
- **Screen stays on** (native flag in the Android app, Wake Lock API on the web)
- **HUD mode**: a mirrored display you can reflect off the windshield at night

## Android app

Build the APK on a PC with Android Studio (JDK 21, Android SDK 36):

```bash
npm ci
npm run android:sync                         # copy www/ into the Android project
cd android && ./gradlew assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
```

Install the APK on the phone: allow *Install unknown apps* for the app that opens the file (e.g. My Files or Chrome). On first start, allow *Precise* location.

A debug APK is signed with the build machine's own debug key. An APK built on a different machine can't install over the old one, so uninstall the old one first.

## Web app

Browsers allow GPS only over **HTTPS** (or `localhost`).

| Where | How |
|---|---|
| Local PC | `npm start` → open http://localhost:8080 |
| Phone | Host `www/` on any HTTPS static host, open the URL, then *Add to Home screen* |

## Tests

```bash
npm test   # unit tests for www/js/speed.js (Node built-in test runner, no dependencies)
```

## Structure

```
www/                      the app (shared by web and Android)
  index.html              UI
  css/style.css           styles (dark, large digits, HUD mode, landscape layout)
  js/speed.js             pure logic: haversine, Kalman filter, trip stats, formatting
  js/app.js               geolocation, wake lock, rendering
  sw.js                   offline cache (web only)
  manifest.webmanifest    PWA install metadata
android/                  native Android project (Capacitor)
capacitor.config.json     app id and name
tests/                    unit tests
```

## Limits

- Accuracy depends on the phone's GPS chip and the sky view. Expect ±1–2 km/h at a steady speed.
- After a tunnel, readings take a few seconds to recover.
- Accelerometer and gyroscope are **not** used for speed. Without a fixed phone mount and calibration they drift too much to help.
- Do not use the app instead of the car's speedometer. Don't operate the phone while driving.
