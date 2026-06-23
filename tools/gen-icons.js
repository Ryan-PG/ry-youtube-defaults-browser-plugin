/* =====================================================================
 * gen-icons.js - generate the extension icons with Node.js (stdlib only)
 * ---------------------------------------------------------------------
 * Output: icons/icon16.png, icon32.png, icon48.png, icon128.png
 * Design: a square with rounded corners, YouTube-red background (#FF0033)
 *         and a white play triangle in the center.
 * No external dependencies - hand-written PNG with CRC and zlib.
 * ===================================================================== */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------- hand-written PNG encoder ----------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // image data + per-row filter
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- draw the icon ----------
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [0xff, 0x00, 0x33, 0xff];     // YouTube red
  const fg = [0xff, 0xff, 0xff, 0xff];     // white
  const transparent = [0, 0, 0, 0];

  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };

  // corner radius scaled to the icon size
  const radius = Math.round(size * 0.22);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded corners: distance from the nearest rounded edge
      let inside = true;
      // top-left corner
      if (x < radius && y < radius) {
        const dx = radius - x, dy = radius - y;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      // top-right corner
      else if (x >= size - radius && y < radius) {
        const dx = x - (size - radius - 1), dy = radius - y;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      // bottom-left corner
      else if (x < radius && y >= size - radius) {
        const dx = radius - x, dy = y - (size - radius - 1);
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      // bottom-right corner
      else if (x >= size - radius && y >= size - radius) {
        const dx = x - (size - radius - 1), dy = y - (size - radius - 1);
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      set(x, y, inside ? bg : transparent);
    }
  }

  // white play triangle in the center (pointing right)
  // center is shifted slightly right for visual balance
  const cx = size * 0.55;
  const cy = size / 2;
  const triH = size * 0.34; // half the triangle height
  const triW = size * 0.26; // half the vertical base width

  // background is already drawn; now draw the triangle via point-in-triangle test
  // triangle with three vertices: A (left-top), B (left-bottom), C (right-middle)
  const A = [cx - triW, cy - triH];
  const B = [cx - triW, cy + triH];
  const C = [cx + triW, cy];

  function pointInTriangle(px, py) {
    const d1 = sign(px, py, A, C);
    const d2 = sign(px, py, C, B);
    const d3 = sign(px, py, B, A);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  }
  function sign(px, py, p1, p2) {
    return (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1]);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // only paint over background pixels (leave transparent corners untouched)
      const i = (y * size + x) * 4;
      if (buf[i + 3] === 0) continue;
      if (pointInTriangle(x, y)) {
        set(x, y, fg);
      }
    }
  }

  return encodePNG(size, size, buf);
}

// ---------- run ----------
const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 48, 128];
for (const s of sizes) {
  const png = drawIcon(s);
  const file = path.join(outDir, `icon${s}.png`);
  fs.writeFileSync(file, png);
  console.log(`Written: ${file} (${png.length} bytes)`);
}

console.log("Done - icons generated.");
