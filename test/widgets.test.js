// -----------------------------------------------------------------------------
// The dashboard widgets. The handlers take their outside world by injection, so
// no Gladys and no network are involved; every content is also run through the
// SDK's own validator — the checks the core applies — so a card that passes here
// is rendered exactly as sent.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { UV_LEVEL_ADVICE } from '../src/uv/scale.js';
import {
  buildLocationContent,
  buildOverviewContent,
  createWidgets,
  MAX_OVERVIEW_ROWS,
  nudgeWidgets,
  UV_LEVEL_COLORS,
  WIDGET,
} from '../src/widgets.js';

const MAISON = { id: 'loc-1', name: 'Maison', latitude: 47.2, longitude: -1.55 };
const BUREAU = { id: 'loc-2', name: 'Bureau', latitude: 48.86, longitude: 2.35 };

const READING = {
  provider: 'open-meteo-cams',
  uvIndex: 7,
  uvIndexClearSky: 8,
  uvIndexMaxToday: 8,
  level: 3,
  levelMaxToday: 4,
  measuredAt: '2026-08-06T14:00',
  peakTime: '2026-08-06T13:00',
  forecast: [
    { time: '2026-08-06T12:00', uvIndex: 6 },
    { time: '2026-08-06T13:00', uvIndex: 8 },
    { time: '2026-08-06T14:00', uvIndex: 7 },
  ],
  utcOffsetSeconds: 7200,
};

const EMPTY_READING = {
  provider: 'open-meteo-cams',
  uvIndex: null,
  uvIndexClearSky: null,
  uvIndexMaxToday: null,
  level: null,
  levelMaxToday: null,
  measuredAt: null,
  peakTime: null,
  forecast: [],
  utcOffsetSeconds: null,
};

/** The first component of a type. */
const find = (content, type) => content.components.find((component) => component.type === type);

/** Widgets wired to an in-memory list and a canned reader. */
function widgetsFor(locations, readUvIndex = async () => READING) {
  const config = { locations };
  return createWidgets({
    getConfig: () => config,
    watchedLocations: (current) => current.locations,
    locationOfDevice: (current, externalId) =>
      current.locations.find((location) => `device:${location.id}` === externalId),
    readUvIndex,
  });
}

test('the location card passes the checks the core applies, untrimmed', () => {
  assert.deepEqual(validateWidgetContent(buildLocationContent(MAISON, READING)), []);
});

test('the location card shows the index, its level and the advice from ONE reading', () => {
  const content = buildLocationContent(MAISON, READING);
  const [now, max, clearSky] = content.components.filter((c) => c.type === 'value');

  assert.equal(now.value, 7);
  assert.equal(now.color, UV_LEVEL_COLORS[3]);
  assert.equal(max.value, 8);
  assert.equal(max.color, UV_LEVEL_COLORS[4], 'the peak is coloured by ITS level');
  assert.equal(clearSky.value, 8);

  const [exposure, peak] = find(content, 'status').items;
  assert.deepEqual(exposure.value, { en: 'High', fr: 'Élevé' });
  assert.deepEqual(peak.value, { en: '8 at 13:00', fr: '8 à 13:00' });

  const body = content.components.find((c) => c.type === 'text' && c.variant === 'body');
  assert.deepEqual(body.text, UV_LEVEL_ADVICE[3]);
});

test('the forecast curve sits on real instants, the peak marked', () => {
  const chart = find(buildLocationContent(MAISON, READING), 'chart');

  assert.deepEqual(
    chart.series[0].points.map((point) => point.t),
    ['2026-08-06T12:00:00+02:00', '2026-08-06T13:00:00+02:00', '2026-08-06T14:00:00+02:00'],
  );
  assert.equal(chart.now_marker, true);
  assert.equal(chart.annotations[0].t, '2026-08-06T13:00:00+02:00');
  assert.equal(chart.annotations[0].value, 8);
});

test('a curve that cannot be placed in time is left out, not drawn in the wrong zone', () => {
  const content = buildLocationContent(MAISON, { ...READING, utcOffsetSeconds: null });
  assert.equal(find(content, 'chart'), undefined);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('a missing value is a dash on the card, never a zero', () => {
  const content = buildLocationContent(MAISON, EMPTY_READING);
  for (const tile of content.components.filter((c) => c.type === 'value')) {
    assert.equal(tile.value, '—');
  }
  assert.equal(find(content, 'status').items.length, 1, 'no peak without a peak');
  assert.equal(find(content, 'status').items[0].color, WIDGET_COLORS.NEUTRAL);
  assert.equal(
    content.components.find((c) => c.variant === 'body'),
    undefined,
    'no advice without a level',
  );
  assert.deepEqual(validateWidgetContent(content), []);
});

test('an index of 0 is shown as 0: the sun being down is data', () => {
  const night = { ...READING, uvIndex: 0, level: 0 };
  const [now] = buildLocationContent(MAISON, night).components.filter((c) => c.type === 'value');
  assert.equal(now.value, 0);
});

test('the location card reads the location its device belongs to', async () => {
  const read = [];
  const widgets = widgetsFor([MAISON, BUREAU], async (location) => {
    read.push(location.name);
    return READING;
  });

  const content = await widgets[WIDGET.LOCATION]({ settings: { location: 'device:loc-2' } });

  assert.deepEqual(read, ['Bureau']);
  assert.match(find(content, 'text').text.fr, /^Bureau · màj 06\/08\/2026 à 14:00$/);
});

test('a device whose location was removed gets a card that says so', async () => {
  const widgets = widgetsFor([MAISON]);
  const content = await widgets[WIDGET.LOCATION]({ settings: { location: 'device:gone' } });

  assert.match(content.components[0].text.fr, /n'est plus suivi/);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('the overview has one row per location, coloured by level', async () => {
  const widgets = widgetsFor([MAISON, BUREAU], async (location) =>
    location.id === 'loc-1' ? READING : { ...READING, uvIndex: 1, level: 1 },
  );
  const content = await widgets[WIDGET.OVERVIEW]();

  const { items } = find(content, 'status');
  assert.deepEqual(
    items.map((item) => [item.label, item.value.fr, item.color]),
    [
      ['Maison', '7 · Élevé', UV_LEVEL_COLORS[3]],
      ['Bureau', '1 · Faible', UV_LEVEL_COLORS[1]],
    ],
  );
  assert.deepEqual(validateWidgetContent(content), []);
});

test('one location failing does not blank the overview', async () => {
  const widgets = widgetsFor([MAISON, BUREAU], async (location) => {
    if (location.id === 'loc-1') {
      throw new Error('boom');
    }
    return READING;
  });
  const { items } = find(await widgets[WIDGET.OVERVIEW](), 'status');

  assert.equal(items[0].value, '—');
  assert.equal(items[0].color, WIDGET_COLORS.NEUTRAL);
  assert.equal(items[1].value.fr, '7 · Élevé');
});

test('the overview shows the first ten locations and says there are more', () => {
  const entries = Array.from({ length: 12 }, (unused, index) => ({
    location: { id: `loc-${index}`, name: `Lieu ${index + 1}` },
    reading: READING,
  }));
  const content = buildOverviewContent(entries);

  assert.equal(find(content, 'status').items.length, MAX_OVERVIEW_ROWS);
  assert.match(find(content, 'text').text.fr, /10 premiers lieux sur 12/);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('an overview with no location says what to do', async () => {
  const content = await widgetsFor([])[WIDGET.OVERVIEW]();
  assert.match(content.components[0].text.fr, /Aucun lieu/);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('nudging the widgets never throws', () => {
  const asked = [];
  nudgeWidgets({ requestWidgetRefresh: (key) => asked.push(key) });
  assert.deepEqual(asked.sort(), Object.values(WIDGET).sort());

  nudgeWidgets({
    requestWidgetRefresh() {
      throw new Error('bad key');
    },
  });
  nudgeWidgets({}); // an SDK without the method: nothing to do
});
