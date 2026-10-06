#!/usr/bin/env node
/**
 * Generates a small valid PNG for manual/E2E post-upload testing:
 *   node scripts/make-test-image.mjs [width] [height] [outfile]
 * Produces a colorful gradient so it is obvious in the UI that a real
 * image (not a placeholder) was uploaded.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const width = Number(process.argv[2] ?? 400);
const height = Number(process.argv[3] ?? 400);
const out = process.argv[4] ?? 'test-post-image.png';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// Raw scanlines: each row prefixed with filter byte 0.
const raw = Buffer.alloc(height * (1 + width * 3));
for (let y = 0; y < height; y++) {
  const rowStart = y * (1 + width * 3);
  raw[rowStart] = 0;
  for (let x = 0; x < width; x++) {
    const i = rowStart + 1 + x * 3;
    raw[i] = Math.round((x / width) * 255);           // red ramp
    raw[i + 1] = Math.round((y / height) * 255);      // green ramp
    raw[i + 2] = Math.round(((x + y) / (width + height)) * 255); // blue ramp
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // colour type: truecolour

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(out, png);
console.log(`wrote ${out}: ${width}x${height}, ${png.length} bytes`);
