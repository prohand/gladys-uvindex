// -----------------------------------------------------------------------------
// Source of `cover.jpg`, the catalog cover.
//
// The cover is a binary that nobody can edit meaningfully once it is committed,
// so what it is MADE OF lives here: a self-contained HTML page, rasterized by a
// headless browser. One command writes both:
//
//   node tools/cover.mjs                 # -> tools/cover.html + cover.jpg
//   CHROMIUM=/path/to/chrome node tools/cover.mjs
//
// THE STORE VALIDATES THE COVER, AND GLADYS NEVER TELLS YOU IT FAILED. The
// indexer of `GladysAssistant/integration-store` downloads `cover_image` and
// checks it against one contract (its C.1): JPEG or PNG magic bytes, EXACTLY
// 800x534 pixels, 150 KB MAXIMUM. A cover that misses any of the three is not
// an error — the integration is still indexed, with the store's own plain blue
// `placeholder.png` in its place. The catalog then shows that blue rectangle
// and nothing anywhere says why. `test/cover.test.js` is what says why here.
//
// Hence the two things that look like arbitrary choices below:
//
//   - The page is laid out in 800x534 CSS pixels and rendered at a device
//     scale factor of 1. The contract wants those exact pixels, so there is no
//     resolution to choose: everything drawn here is vector or gradient, and it
//     is drawn at the size the catalog displays.
//   - The output is JPEG. Chromium's `--screenshot` flag only ever writes PNG,
//     and a PNG of THIS picture — full-bleed gradient, blurred sun, not one
//     flat area to run-length away — weighs ~270 KB at 800x534, well past the
//     cap. The same frame as JPEG is ~55 KB with nothing visibly lost, which is
//     why the browser is driven through the DevTools protocol instead.
//
// WHAT THE PICTURE SAYS, and why it says it that way:
//
//   - A HIGH sun in a clear sky. The UV index peaks when the sun is high and
//     the sky is clear; the sunset the first cover drew is the moment the index
//     reads 0, which is the opposite of what this integration is about.
//   - THE WHO BANDS ARE THE ARC. The colours are the scale of `src/uv/scale.js`
//     in the order it defines them, level 0 included — the muted slate this
//     integration adds below the WHO's own lowest band.
//   - A READING, not a decoration: a marker on the band and the same number in
//     the middle, so the picture shows a device reporting a value.
//   - NO WORDS. Device names are the only text this integration translates
//     itself (see `src/language.js`); the cover is seen by both languages at
//     once, so it says nothing that would have to be one of them. "UV" and the
//     digits read the same in either.
// -----------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// The store's cover contract (C.1), repeated here because it is what the
// numbers below mean. `test/cover.test.js` holds the same three values.
const W = 800;
const H = 534;
const MAX_BYTES = 150 * 1024;
// 95 lands around 55 KB — a third of the cap. There is no reason to spend the
// headroom on a smaller file when the picture is the shop window.
const JPEG_QUALITY = 95;

// ------------------------------------------------------------------ the gauge
const CX = 262;
const CY = 362;
const R_OUT = 162;
const BAND = 28;
const R_MID = R_OUT - BAND / 2;

// The arc covers 0 to 12. The WHO scale is open-ended, but "11+" is its last
// band, so one more unit past it is all the room the extreme end needs.
const UV_SPAN = 12;

const toAngle = (uv) => 180 + (uv / UV_SPAN) * 180; // degrees, SVG frame
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (deg, r) => [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))];
const f = (n) => Number(n.toFixed(2));

function arcPath(fromDeg, toDeg, r) {
  const [x1, y1] = pt(fromDeg, r);
  const [x2, y2] = pt(toDeg, r);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${f(x1)} ${f(y1)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
}

// The exposure bands of `src/uv/scale.js`, in its own order. Level 0 gets a
// muted slate: it is this integration's addition, not a WHO category, and the
// colour must not claim otherwise.
const SEGMENTS = [
  { from: 0, to: 1, color: '#5b7ea6' },
  { from: 1, to: 3, color: '#2fa14a' },
  { from: 3, to: 6, color: '#f5c400' },
  { from: 6, to: 8, color: '#f77f00' },
  { from: 8, to: 11, color: '#dc2626' },
  { from: 11, to: 12, color: '#7c4dd1' },
];

const GAP = 1.2; // degrees of breathing room between two segments

const segments = SEGMENTS.map(({ from, to, color }, i) => {
  const a1 = toAngle(from) + (i === 0 ? 0 : GAP / 2);
  const a2 = toAngle(to) - (i === SEGMENTS.length - 1 ? 0 : GAP / 2);
  return `<path d="${arcPath(a1, a2, R_MID)}" stroke="${color}" stroke-width="${BAND}" fill="none" />`;
}).join('\n      ');

// The band boundaries, which are what the colours mean.
const TICKS = [
  { uv: 0, label: '0' },
  { uv: 3, label: '3' },
  { uv: 6, label: '6' },
  { uv: 8, label: '8' },
  { uv: 11, label: '11+' },
];

const ticks = TICKS.map(({ uv, label }) => {
  const a = toAngle(uv);
  const [x1, y1] = pt(a, R_OUT + 5);
  const [x2, y2] = pt(a, R_OUT + 12);
  const [tx, ty] = pt(a, R_OUT + 29);
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round" />
      <text class="tick" x="${f(tx)}" y="${f(ty + 5)}">${label}</text>`;
}).join('\n      ');

// The reading on show: 9, a realistic summer peak in the south of France, well
// inside the "very high" band and clear of every threshold tick. A marker rides
// the scale instead of a needle, which leaves the inside of the arc to the
// number itself.
const VALUE = 9;
const [dotX, dotY] = pt(toAngle(VALUE), R_MID);

const html = `<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    position: relative;
    font-family: 'Liberation Sans', Arial, 'DejaVu Sans', sans-serif;
    /* Clear midday sky: the index peaks with the sun high, so the light does. */
    background: linear-gradient(to bottom,
      #06246b 0%,
      #0a3d9c 28%,
      #1f6fce 54%,
      #57a6e0 75%,
      #9fcfec 89%,
      #ffdcaa 97%,
      #ffc887 100%);
  }
  .layer { position: absolute; inset: 0; }

  /* Sun ---------------------------------------------------------------- */
  .rays {
    position: absolute; left: 342px; top: -178px; width: 760px; height: 760px;
    background: repeating-conic-gradient(from 6deg at 50% 50%,
      rgba(255,238,186,.28) 0deg 3.6deg,
      rgba(255,238,186,0) 3.6deg 19deg);
    -webkit-mask-image: radial-gradient(closest-side,
      rgba(0,0,0,0) 16%, rgba(0,0,0,.85) 30%, rgba(0,0,0,.35) 58%, rgba(0,0,0,0) 78%);
    filter: blur(5px);
  }
  .bloom {
    position: absolute; left: 452px; top: -68px; width: 540px; height: 540px;
    background: radial-gradient(circle at 50% 50%,
      rgba(255,255,255,.92) 0%,
      rgba(255,248,220,.62) 20%,
      rgba(255,216,140,.32) 38%,
      rgba(255,196,120,.12) 58%,
      rgba(255,190,110,0) 74%);
  }
  .disc {
    position: absolute; left: 638px; top: 118px; width: 136px; height: 136px;
    border-radius: 50%;
    background: radial-gradient(circle at 46% 42%,
      #ffffff 0%, #fffceb 40%, #ffeeb4 68%, #ffd67e 100%);
    box-shadow: 0 0 60px 22px rgba(255,236,178,.5);
  }

  /* Atmosphere --------------------------------------------------------- */
  .haze {
    position: absolute; left: -60px; right: -60px; bottom: 0; height: 190px;
    background: linear-gradient(to bottom,
      rgba(255,255,255,0) 0%,
      rgba(255,238,200,.09) 50%,
      rgba(255,226,176,.26) 84%,
      rgba(255,218,160,.40) 100%);
    filter: blur(12px);
  }
  /* Darkens the sky behind the gauge, which is the only thing holding the
     white number away from the bright half of the picture. */
  .scrim {
    background: radial-gradient(56% 66% at 30% 58%,
      rgba(3,17,58,.44) 0%, rgba(3,17,58,.26) 46%, rgba(3,17,58,0) 78%);
  }
  .vignette {
    background: radial-gradient(120% 96% at 50% 44%,
      rgba(2,12,44,0) 52%, rgba(2,12,44,.16) 80%, rgba(2,12,44,.34) 100%);
  }

  /* Gauge -------------------------------------------------------------- */
  svg { position: absolute; inset: 0; }
  .tick {
    font-size: 14px; font-weight: 700; fill: rgba(255,255,255,.8);
    text-anchor: middle; letter-spacing: .3px;
  }
  .value {
    font-size: 98px; font-weight: 700; fill: #fff;
    text-anchor: middle; letter-spacing: -1px;
  }
  .unit {
    font-size: 19px; font-weight: 700; fill: rgba(255,255,255,.9);
    text-anchor: middle; letter-spacing: 2px;
  }
</style>

<div class="layer">
  <div class="rays"></div>
  <div class="bloom"></div>
  <div class="disc"></div>
</div>
<div class="layer scrim"></div>
<div class="haze"></div>
<div class="layer vignette"></div>

<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="3" stdDeviation="7" flood-color="#04143c" flood-opacity=".4" />
    </filter>
    <filter id="text" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="8" flood-color="#04143c" flood-opacity=".5" />
    </filter>
  </defs>

  <g filter="url(#soft)">
    <!-- The unlit track under the colours, so the arc reads as a full range. -->
    <path d="${arcPath(180, 360, R_MID)}" stroke="rgba(6,26,74,.26)" stroke-width="${BAND + 9}" fill="none" />
    ${segments}
  </g>

  <g>
    ${ticks}
  </g>

  <g filter="url(#soft)">
    <circle cx="${f(dotX)}" cy="${f(dotY)}" r="11" fill="#dc2626" stroke="#ffffff" stroke-width="5" />
  </g>

  <g filter="url(#text)">
    <text class="value" x="${CX}" y="${CY - 50}">${VALUE}</text>
    <text class="unit" x="${CX + 1}" y="${CY - 12}">UV</text>
  </g>
</svg>
`;

const page = new URL('./cover.html', import.meta.url);
writeFileSync(page, html);
console.log(`wrote ${page.pathname}`);

// ----------------------------------------------------------------- rasterize
// A minimal DevTools protocol client: launch, attach, navigate, capture. Node's
// own WebSocket and fetch are all it takes, so the tool stays dependency-free —
// nothing here belongs in the container that ships.

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM,
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

/** Where DevTools is listening, as Chromium writes it into its profile. */
async function readDevToolsUrl(profileDir) {
  const portFile = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const [port, path] = readFileSync(portFile, 'utf8').split('\n');
      if (port && path) {
        return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
      }
    } catch {
      // The file appears only once the browser is up; keep waiting.
    }
    await delay(100);
  }
  throw new Error('Chromium never opened its DevTools port');
}

/** Open a DevTools connection and return `send(method, params, sessionId)`. */
async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools refused the connection')), {
      once: true,
    });
  });

  let lastId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const settle = pending.get(message.id);
      pending.delete(message.id);
      settle(message);
      return;
    }
    listeners.forEach((listener) => listener(message));
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = (lastId += 1);
      pending.set(id, (message) =>
        message.error
          ? reject(new Error(`${method}: ${message.error.message}`))
          : resolve(message.result),
      );
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

  /** Resolve on the first event named `method`. */
  const once = (method) =>
    new Promise((resolve) => {
      const listener = (message) => {
        if (message.method === method) {
          listeners.delete(listener);
          resolve(message.params);
        }
      };
      listeners.add(listener);
    });

  return { send, once, close: () => socket.close() };
}

async function screenshot() {
  const profileDir = mkdtempSync(join(tmpdir(), 'gladys-uvindex-cover-'));
  let browser;
  let lastError;
  for (const executable of CHROMIUM_CANDIDATES) {
    browser = spawn(executable, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ]);
    // spawn() reports a missing executable asynchronously, so the next
    // candidate is only reachable from here.
    const failed = await Promise.race([
      new Promise((resolve) => browser.once('error', resolve)),
      delay(300).then(() => null),
    ]);
    if (!failed) {
      break;
    }
    lastError = failed;
    browser = undefined;
  }
  if (!browser) {
    rmSync(profileDir, { recursive: true, force: true });
    throw new Error(
      `No Chromium found (tried ${CHROMIUM_CANDIDATES.join(', ')}). Set CHROMIUM to one. ${lastError?.message ?? ''}`,
    );
  }
  // Chromium is chatty on stderr about D-Bus and GPU; none of it is ours.
  browser.stderr.resume();

  let devtools;
  try {
    devtools = await connect(await readDevToolsUrl(profileDir));
    const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });

    await devtools.send('Page.enable', {}, sessionId);
    // The viewport IS the cover: one CSS pixel, one image pixel.
    await devtools.send(
      'Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    const loaded = devtools.once('Page.loadEventFired');
    await devtools.send('Page.navigate', { url: page.href }, sessionId);
    await loaded;
    // The blurs and the masked ray gradient are composited a frame or two after
    // load; capturing on the load event alone catches the sun half-drawn.
    await delay(500);

    const { data } = await devtools.send(
      'Page.captureScreenshot',
      {
        format: 'jpeg',
        quality: JPEG_QUALITY,
        clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
      },
      sessionId,
    );
    return Buffer.from(data, 'base64');
  } finally {
    // A signal only reaches the process we spawned, and Chromium's renderers
    // outlive it writing to the profile — which is what makes removing the
    // directory fail. `Browser.close` is what takes the whole tree down.
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    try {
      await devtools?.send('Browser.close');
    } catch {
      browser.kill();
    }
    devtools?.close();
    await Promise.race([exited, delay(10_000)]);
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

const cover = await screenshot();
// Fail here rather than let a rejected cover reach the store, where the only
// symptom is a blue rectangle in the catalog.
if (cover.length > MAX_BYTES) {
  throw new Error(
    `cover is ${Math.ceil(cover.length / 1024)} KB, the store accepts ${MAX_BYTES / 1024} KB`,
  );
}
const coverPath = new URL('../cover.jpg', import.meta.url);
writeFileSync(coverPath, cover);
console.log(`wrote ${coverPath.pathname} — ${W}x${H}, ${Math.ceil(cover.length / 1024)} KB`);
