// -----------------------------------------------------------------------------
// The catalog cover, checked against the contract that actually judges it.
//
// `cover_image` is downloaded and validated by the indexer of
// `GladysAssistant/integration-store` (its C.1): JPEG or PNG magic bytes,
// EXACTLY 800x534 pixels, 150 KB maximum. Nothing about that check is visible
// from here — a cover that misses it does NOT reject the integration and does
// NOT log anything the author will ever read. The integration is indexed with
// the store's own plain blue `placeholder.png` in place of the cover, and the
// catalog shows that blue rectangle forever after.
//
// This file is the only warning there is. It would have run red on the
// 1200x801, 620 KB PNG that shipped as the cover of 1.0.0 and 1.0.1 and never
// once reached the catalog.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The store's C.1 contract, byte for byte and pixel for pixel.
const COVER_WIDTH = 800;
const COVER_HEIGHT = 534;
const COVER_MAX_BYTES = 150 * 1024;

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Read an image's type and size from its bytes, the way the indexer does:
 * the URL extension and the Content-Type are never trusted.
 *
 * @param {Buffer} data the raw image
 * @returns {{type: 'png'|'jpg', width: number, height: number}} what it really is
 */
function readImage(data) {
  if (data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    // IHDR is the first chunk of every PNG, and its width and height open it.
    return { type: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    // Walk the segments to the start-of-frame, which is where the size is.
    // SOF0..SOF15, minus the three markers in that range that frame nothing:
    // DHT (C4), JPG (C8) and DAC (CC).
    let offset = 2;
    while (offset + 9 < data.length) {
      assert.equal(data[offset], 0xff, 'malformed JPEG: expected a marker');
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          type: 'jpg',
          height: data.readUInt16BE(offset + 5),
          width: data.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
    assert.fail('malformed JPEG: no start-of-frame segment');
  }
  return assert.fail('the cover is neither a PNG nor a JPEG');
}

test('the manifest points at a cover committed next to it', () => {
  // The core refuses a manifest whose cover_image is not https, and the raw
  // GitHub URL is the whole point of committing the file: the indexer downloads
  // what `main` holds, not what the last release built.
  assert.ok(
    manifest.cover_image.startsWith('https://'),
    'cover_image must be an https URL — Gladys rejects the manifest otherwise',
  );
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/prohand/gladys-uvindex/main/cover.jpg',
    'cover_image must be the raw URL of the cover this repository holds on main',
  );
});

test('the cover is exactly what the store indexer accepts', async () => {
  const cover = await readFile(new URL('../cover.jpg', import.meta.url));

  assert.ok(
    cover.length <= COVER_MAX_BYTES,
    `the cover is ${Math.ceil(cover.length / 1024)} KB, the store accepts ${COVER_MAX_BYTES / 1024} KB — ` +
      'over the cap it is silently replaced by the store placeholder',
  );

  const { type, width, height } = readImage(cover);
  assert.ok(['png', 'jpg'].includes(type));
  assert.deepEqual(
    { width, height },
    { width: COVER_WIDTH, height: COVER_HEIGHT },
    `the store wants exactly ${COVER_WIDTH}x${COVER_HEIGHT}, not ${width}x${height} — ` +
      'a cover of any other size is silently replaced by the store placeholder',
  );
});
