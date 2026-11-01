import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate } from '../src/dates.js';

test('NHTSA day/month/year becomes YYYY-MM-DD', () => {
  assert.equal(isoDate('17/07/2020', 'dmy'), '2020-07-17');
  assert.equal(isoDate('05/05/2020', 'dmy'), '2020-05-05');
  assert.equal(isoDate('1/2/2003', 'dmy'), '2003-02-01');
});

test('Transport Canada month/day/year with a time becomes YYYY-MM-DD', () => {
  assert.equal(isoDate('7/20/2020 12:00:00 AM', 'mdy'), '2020-07-20');
  assert.equal(isoDate('12/17/2021 12:00:00 AM', 'mdy'), '2021-12-17');
});

test('a day over 12 in the month position is read the other way round', () => {
  assert.equal(isoDate('07/17/2020', 'dmy'), '2020-07-17');
  assert.equal(isoDate('20/7/2020', 'mdy'), '2020-07-20');
});

test('ISO dates and timestamps keep their date', () => {
  assert.equal(isoDate('2003-01-15'), '2003-01-15');
  assert.equal(isoDate('2021-12-17T05:31:02.000Z'), '2021-12-17');
});

test('anything unreadable comes back as it was', () => {
  assert.equal(isoDate('soon'), 'soon');
  assert.equal(isoDate('13/13/2020'), '13/13/2020');
  assert.equal(isoDate(undefined), null);
  assert.equal(isoDate(''), null);
});
