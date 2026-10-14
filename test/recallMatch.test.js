import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recallMismatch } from '../src/recallMatch.js';

// Decoded like a 2020 Transit cargo van: RWD, 3.5L gasoline, high roof.
const van = { make: 'FORD', model: 'Transit', year: 2020, trim: 'High Roof', bodyClass: 'Cargo Van',
  driveType: 'RWD/Rear-Wheel Drive', fuelType: 'Gasoline', displacementL: '3.5', engineCylinders: '6', turbo: 'No' };
const r = (summary, component = '') => ({ summary, component });

test('AWD-only recall does not apply to a RWD van', () => {
  const m = recallMismatch(r('Ford Motor Company (Ford) is recalling certain 2020 Transit vehicles equipped with All Wheel Drive (AWD). The bolts that attach the rear driveshaft to the transfer case may become loose.'), van);
  assert.equal(m.length, 1);
  assert.match(m[0], /all-wheel/);
});

test('general recall still applies', () => {
  assert.deepEqual(recallMismatch(r('Ford Motor Company (Ford) is recalling certain 2020 Transit vehicles. The rearview camera image may not display.'), van), []);
});

test('engine, fuel, electric and roof mismatches', () => {
  assert.equal(recallMismatch(r('certain 2020 Transit vehicles equipped with 3.5L EcoBoost engines'), van).length, 1, 'ecoboost only once displacement matches');
  assert.match(recallMismatch(r('vehicles equipped with a 2.0L diesel engine'), van).join(' '), /diesel.*2\.0L/s);
  assert.match(recallMismatch(r('certain 2022 E-Transit vehicles. The high voltage battery may'), van)[0], /electric/);
  assert.match(recallMismatch(r('certain Transit low roof and medium roof vans'), van)[0], /low \/ medium-roof/);
});

test('mentions that include this configuration keep the recall', () => {
  assert.deepEqual(recallMismatch(r('vehicles with rear-wheel drive or all-wheel drive'), van), []);
  assert.deepEqual(recallMismatch(r('high roof and medium roof vans'), van), []);
  assert.deepEqual(recallMismatch(r('vehicles with 3.5L or 2.0L engines'), van), []);
});

test('unknown vehicle specs never exclude a recall', () => {
  assert.deepEqual(recallMismatch(r('vehicles equipped with All Wheel Drive and the 3.5L EcoBoost'), { make: 'FORD' }), []);
  assert.deepEqual(recallMismatch(r('equipped with AWD'), null), []);
});
