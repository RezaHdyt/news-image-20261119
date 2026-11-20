// news-image-20261119: a clean one-page newspaper front page summing up
// Thursday 19 November 2026 in 36 verified stories, leading with the ICJ's
// Rohingya genocide ruling against Myanmar and the first Trump-Xi-Putin
// trilateral summit in Shenzhen.
//
// The finished image lives beside this file as entry.png. This program
// validates it against the competition gate -- a whole PNG, at most 1 MiB,
// at most 1024x1024 -- and copies it to the output directory. Node 22,
// standard library only, no network.
//
// Run it locally with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1048576;
const MAX_SIDE = 1024;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'entry.png');

if (!existsSync(source)) {
  throw new Error('entry.png is missing from the repository');
}
const png = readFileSync(source);

function reject(reason) {
  throw new Error(`entry.png rejected: ${reason}`);
}

// Signature first: the first eight bytes identify a PNG.
if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) {
  reject('bad PNG signature');
}
// The first chunk must be IHDR, 13 bytes of data: anything else is not
// a PNG the gate can read, however good the signature looks.
if (png.length < 33) reject('file too short for a complete IHDR chunk');
if (png.readUInt32BE(8) !== 13) reject('first chunk length is not 13');
if (png.subarray(12, 16).toString('latin1') !== 'IHDR') {
  reject('first chunk is not IHDR');
}
// CRC32 (IEEE, the PNG polynomial) over the IHDR type + data: a corrupt
// header must fail here, not slip through on its dimensions alone.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const ihdrCrc = crc32(png.subarray(12, 29));
if (ihdrCrc !== png.readUInt32BE(29)) {
  reject('IHDR CRC mismatch: the header is corrupt');
}
// Bit depth and colour type live at offsets 24 and 25; only the combos
// the PNG spec allows may pass (this entry is colour type 2, depth 8).
const bitDepth = png[24];
const colorType = png[25];
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
if (!DEPTHS[colorType] || !DEPTHS[colorType].includes(bitDepth)) {
  reject(`unsupported IHDR combination: colour type ${colorType}, bit depth ${bitDepth}`);
}
// IHDR holds width and height as big-endian uint32s at offsets 16 and 20.
if (png.length < 24) reject('file too short for an IHDR chunk');
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
// The PNG spec requires non-zero IHDR dimensions; a 0-wide or 0-tall
// image would otherwise slip past the upper-bound check below.
if (width === 0 || height === 0) {
  reject(`dimensions ${width}x${height} are invalid: width and height must be non-zero`);
}
if (width > MAX_SIDE || height > MAX_SIDE) {
  reject(`dimensions ${width}x${height} exceed the ${MAX_SIDE}x${MAX_SIDE} limit`);
}
if (png.length > MAX_BYTES) {
  reject(`size ${png.length} bytes exceeds the ${MAX_BYTES}-byte limit`);
}
// Walk the chunk chain to the IEND chunk: a whole PNG ends there, with
// every chunk's length landing exactly on the next chunk's start.
let offset = 8;
let sawIend = false;
while (offset + 12 <= png.length) {
  const length = png.readUInt32BE(offset);
  const type = png.subarray(offset + 4, offset + 8).toString('latin1');
  const next = offset + 12 + length;
  if (next > png.length) reject(`chunk ${type} overruns the file`);
  if (type === 'IEND') {
    sawIend = true;
    if (next !== png.length) reject('trailing bytes after the IEND chunk');
    break;
  }
  offset = next;
}
if (!sawIend) reject('no IEND chunk: the PNG is truncated');

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
// A plain byte copy, so every run writes exactly the repository's image
// and repeated runs are deterministic by construction.
copyFileSync(source, join(outDir, 'entry.png'));
