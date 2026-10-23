import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversine,
  bearing,
  measureSpeed,
  SpeedFilter,
  TripStats,
  toDisplaySpeed,
  toDisplayDistance,
  headingToCompass,
  formatDuration,
} from '../js/speed.js';

const fix = (latitude, longitude, timestamp, extra = {}) => ({
  timestamp,
  coords: { latitude, longitude, accuracy: 5, speed: null, heading: null, ...extra },
});

test('haversine: 1° of latitude is ~111.2 km', () => {
  const d = haversine({ latitude: 50, longitude: 14 }, { latitude: 51, longitude: 14 });
  assert.ok(Math.abs(d - 111195) < 50, `got ${d}`);
});

test('haversine: Prague → Brno is ~185 km', () => {
  const d = haversine({ latitude: 50.0755, longitude: 14.4378 }, { latitude: 49.1951, longitude: 16.6068 });
  assert.ok(Math.abs(d - 185000) < 2000, `got ${d}`);
});

test('bearing: due east and due north', () => {
  assert.ok(Math.abs(bearing({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 90) < 1e-9);
  assert.ok(Math.abs(bearing({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })) < 1e-9);
});

test('measureSpeed: prefers Doppler speed from the receiver', () => {
  const m = measureSpeed(null, fix(50, 14, 0, { speed: 13.9 }));
  assert.equal(m.source, 'doppler');
  assert.equal(m.speed, 13.9);
});

test('measureSpeed: ignores invalid Doppler (-1 on iOS) and falls back to position', () => {
  const a = fix(50, 14, 0);
  const b = fix(50.0001, 14, 1000, { speed: -1 }); // ~11.1 m north in 1 s
  const m = measureSpeed(a, b);
  assert.equal(m.source, 'position');
  assert.ok(Math.abs(m.speed - 11.12) < 0.05, `got ${m.speed}`);
});

test('measureSpeed: null without Doppler and without previous fix', () => {
  assert.equal(measureSpeed(null, fix(50, 14, 0)), null);
});

test('measureSpeed: null when fixes are too close in time', () => {
  assert.equal(measureSpeed(fix(50, 14, 0), fix(50.0001, 14, 100)), null);
});

test('SpeedFilter: converges to a constant speed', () => {
  const f = new SpeedFilter();
  let v;
  for (let i = 0; i < 20; i++) v = f.update({ speed: 20, variance: 0.25 }, i * 1000);
  assert.ok(Math.abs(v - 20) < 1e-6);
});

test('SpeedFilter: damps a single noisy outlier with low-confidence measurement', () => {
  const f = new SpeedFilter();
  for (let i = 0; i < 10; i++) f.update({ speed: 20, variance: 0.25 }, i * 1000);
  const v = f.update({ speed: 40, variance: 100 }, 10000);
  assert.ok(v < 22, `outlier pulled speed to ${v}`);
});

test('SpeedFilter: follows a trusted measurement quickly', () => {
  const f = new SpeedFilter();
  for (let i = 0; i < 10; i++) f.update({ speed: 20, variance: 0.25 }, i * 1000);
  const v = f.update({ speed: 25, variance: 0.09 }, 11000);
  assert.ok(v > 24, `lagging at ${v}`);
});

test('SpeedFilter: never negative', () => {
  const f = new SpeedFilter();
  f.update({ speed: 0.2, variance: 1 }, 0);
  assert.ok(f.update({ speed: 0, variance: 0.01 }, 1000) >= 0);
});

test('TripStats: distance, max, avg and moving time', () => {
  const t = new TripStats();
  t.add(10, 0);
  t.add(10, 1000);
  t.add(20, 2000);
  t.add(0, 3000); // standing — no distance, no moving time
  assert.equal(t.distance, 30);
  assert.equal(t.maxSpeed, 20);
  assert.equal(t.movingTime, 2000);
  assert.equal(t.avgSpeed, 15);
});

test('TripStats: ignores long gaps (tunnel / background)', () => {
  const t = new TripStats();
  t.add(30, 0);
  t.add(30, 60000);
  assert.equal(t.distance, 0);
});

test('toDisplaySpeed: units and standstill dead-band', () => {
  assert.equal(toDisplaySpeed(27.7778, 'kmh'), 100);
  assert.equal(toDisplaySpeed(26.8224, 'mph'), 60);
  assert.equal(toDisplaySpeed(0.4, 'kmh'), 0);
  assert.equal(toDisplaySpeed(NaN, 'kmh'), 0);
});

test('toDisplayDistance: km and miles', () => {
  assert.equal(toDisplayDistance(1500, 'kmh'), 1.5);
  assert.ok(Math.abs(toDisplayDistance(1609.344, 'mph') - 1) < 1e-12);
});

test('headingToCompass', () => {
  assert.equal(headingToCompass(0), 'N');
  assert.equal(headingToCompass(359), 'N');
  assert.equal(headingToCompass(90), 'E');
  assert.equal(headingToCompass(225), 'SW');
  assert.equal(headingToCompass(-90), 'W');
  assert.equal(headingToCompass(NaN), '—');
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65000), '01:05');
  assert.equal(formatDuration(3723000), '1:02:03');
});
