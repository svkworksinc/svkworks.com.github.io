#!/usr/bin/env node
/**
 * One-off image optimizer — NOT part of the Netlify build.
 *
 * Some source images were committed straight from a camera (raychem2.jpg was
 * 6301x4000 / 4.4MB) and were being served to browsers at full resolution.
 * Netlify's build-time compression re-encodes but never downscales, so a
 * 25-megapixel photo stays a 25-megapixel photo.
 *
 * Run manually with `npm run optimize-images` after adding large photos, then
 * commit the results. Re-running is safe: anything already within the size
 * budget is left untouched, so the script converges.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'img');

const MAX_WIDTH = 2000;   // nothing on the site is displayed wider than this
const JPEG_QUALITY = 82;  // visually lossless for photographs at this scale
const MIN_BYTES = 400 * 1024; // leave small files alone entirely

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jpe?g|png)$/i.test(entry.name)) out.push(full);
  }
  return out;
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

/**
 * Resizing changes an image's intrinsic size, which makes any width/height
 * already stamped into the HTML by image-dims.js stale. Strip those attributes
 * from tags referencing the files we just changed so the follow-up
 * `image-dims` run re-derives them correctly.
 */
function clearStaleDimensions(changedBasenames) {
  if (!changedBasenames.size) return 0;
  let touched = 0;
  for (const htmlFile of findHtmlFiles(ROOT)) {
    const original = fs.readFileSync(htmlFile, 'utf8');
    const content = original.replace(/<img\b[^>]*>/gi, (tag) => {
      const src = tag.match(/\bsrc\s*=\s*"([^"]+)"/i)?.[1];
      if (!src) return tag;
      if (!changedBasenames.has(path.basename(src.split('?')[0]))) return tag;
      return tag.replace(/\s*\b(width|height)\s*=\s*"[^"]*"/gi, '');
    });
    if (content !== original) {
      fs.writeFileSync(htmlFile, content);
      touched++;
    }
  }
  return touched;
}

async function main() {
  const files = walk(IMG_DIR);
  const changedBasenames = new Set();
  let optimized = 0;
  let savedBytes = 0;

  for (const file of files) {
    const before = fs.statSync(file).size;
    if (before < MIN_BYTES) continue;

    const meta = await sharp(file).metadata();
    if (!meta.width) continue;
    // Already within budget on both dimensions and file size — nothing to do.
    if (meta.width <= MAX_WIDTH && before < MIN_BYTES * 2) continue;

    const isPng = /\.png$/i.test(file);
    let pipeline = sharp(file).rotate(); // honour EXIF orientation before resizing
    if (meta.width > MAX_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }
    pipeline = isPng
      ? pipeline.png({ compressionLevel: 9, palette: true })
      : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

    const buf = await pipeline.toBuffer();
    if (buf.length >= before) {
      console.log(`  skip   ${path.relative(ROOT, file)} (re-encode was not smaller)`);
      continue;
    }

    fs.writeFileSync(file, buf);

    // Deliberately no WebP sibling: nothing would reference it, and emitting
    // unused files is the exact clutter this pass cleaned up. Netlify's
    // build-time image compression already handles format negotiation, and
    // pages that genuinely want WebP opt in explicitly via <picture>.

    optimized++;
    changedBasenames.add(path.basename(file));
    savedBytes += before - buf.length;
    const mb = n => (n / 1048576).toFixed(2);
    console.log(
      `  resize ${path.relative(ROOT, file)}  ${meta.width}px/${mb(before)}MB -> ` +
      `${Math.min(meta.width, MAX_WIDTH)}px/${mb(buf.length)}MB`
    );
  }

  const cleared = clearStaleDimensions(changedBasenames);
  console.log(`[optimize-images] ${optimized} file(s) optimized, ${(savedBytes / 1048576).toFixed(1)}MB saved.`);
  if (cleared) {
    console.log(`[optimize-images] Cleared stale width/height in ${cleared} HTML file(s) — run \`npm run image-dims\` to restamp.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
