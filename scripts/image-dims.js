#!/usr/bin/env node
/**
 * Injects intrinsic width/height attributes into every static <img> tag whose
 * src points at a local image file.
 *
 * Why: without width/height the browser doesn't know an image's aspect ratio
 * until the bytes arrive, so content below it jumps when it loads. That's
 * Cumulative Layout Shift — a Core Web Vitals metric Google ranks on. The
 * attributes are safe to add because css/style.css already sets
 * `img,video,svg { max-width:100%; height:auto }`, so the image still scales
 * fluidly; the attributes only supply the ratio used to reserve space.
 *
 * Dimensions are read straight out of the file headers (PNG / JPEG / WebP) so
 * this needs no image library. Runs on every Netlify build alongside
 * cachebust.js, and is idempotent — tags that already carry a width are left
 * alone, so the second run of a pair always changes nothing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Reads intrinsic pixel dimensions from a PNG, JPEG or WebP file header. */
function readDimensions(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 24) return null;

  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32s.
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.subarray(0, 8).equals(PNG_SIG)) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: walk the segment chain to the SOFn frame header, which carries the
  // real dimensions. SOF4/SOF8/SOF12 are not frame headers — skip those.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }
      const len = buf.readUInt16BE(offset + 2);
      if (len < 2) return null;
      offset += 2 + len;
    }
    return null;
  }

  // WebP: RIFF container with a VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk.
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buf.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') {
      return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    }
    if (chunk === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return null;
}

function findHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findHtmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const dimCache = new Map();
function cachedDimensions(absPath) {
  if (!dimCache.has(absPath)) dimCache.set(absPath, readDimensions(absPath));
  return dimCache.get(absPath);
}

function main() {
  let filesChanged = 0;
  let tagsUpdated = 0;
  const missing = new Set();

  for (const htmlFile of findHtmlFiles(ROOT)) {
    const original = fs.readFileSync(htmlFile, 'utf8');
    const htmlDir = path.dirname(htmlFile);

    const content = original.replace(/<img\b[^>]*>/gi, (tag) => {
      // Already sized — leave it alone. This is what makes the script idempotent.
      if (/\bwidth\s*=/i.test(tag) || /\bheight\s*=/i.test(tag)) return tag;

      const srcMatch = tag.match(/\bsrc\s*=\s*"([^"]+)"/i);
      if (!srcMatch) return tag;
      const src = srcMatch[1];

      // Remote images, data URIs and markup built by JS template literals all
      // have no local file to measure.
      if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return tag;
      if (src.includes('${') || src.includes('+') || src.includes('<%')) return tag;

      const cleanSrc = src.split('?')[0].split('#')[0];
      const absPath = src.startsWith('/')
        ? path.join(ROOT, cleanSrc)
        : path.resolve(htmlDir, cleanSrc);

      const dims = cachedDimensions(absPath);
      if (!dims || !dims.width || !dims.height) {
        missing.add(path.relative(ROOT, absPath));
        return tag;
      }

      tagsUpdated++;
      // Insert right after `<img` so the attributes read naturally in source.
      return tag.replace(/^<img\b/i, `<img width="${dims.width}" height="${dims.height}"`);
    });

    if (content !== original) {
      fs.writeFileSync(htmlFile, content);
      filesChanged++;
    }
  }

  if (missing.size) {
    console.warn(`[image-dims] Could not measure ${missing.size} referenced image(s):`);
    for (const m of [...missing].sort()) console.warn(`  ${m}`);
  }
  console.log(`[image-dims] ${filesChanged} HTML files updated, ${tagsUpdated} <img> tags sized.`);
}

main();
