#!/usr/bin/env node
/**
 * Rewrites the ?v= cache-busting query string on every shared script/style
 * reference to a content hash of the target file, across every HTML page
 * (including subdirectories) and the one dynamic script-injection point in
 * js/components.js.
 *
 * Runs automatically on every Netlify build (see the build command in
 * netlify.toml) so a forgotten manual version bump can never again leave a
 * fix invisible to browsers that cache /js/* for a year (see netlify.toml's
 * Cache-Control headers). Safe to run repeatedly — always converges to the
 * same result for the same file contents.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

// Local (non-CDN) files referenced with a cache-busting query string.
// Add new shared assets here as they're introduced.
const ASSETS = [
  'js/auth.js',
  'js/components.js',
  'js/parts-catalog.js',
  'js/used-parts.js',
  'js/products.js',
  'js/search.js',
  'js/wishlist.js',
  'js/main.js',
  'js/wiring-diagram.js',
  'data/wiring-data.js',
  'js/cart.js',
  'js/checkout.js',
  'components/header.js',
  'components/footer.js',
  'data/products-data.js',
];

function hashFile(relPath) {
  const content = fs.readFileSync(path.join(ROOT, relPath));
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
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

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function main() {
  // Patch the one dynamic script-injection point BEFORE hashing components.js,
  // so its own content hash (used for <script src="js/components.js?v=...">)
  // reflects the line we're about to change, not a stale pre-change version.
  const componentsPath = path.join(ROOT, 'js/components.js');
  const authHash = hashFile('js/auth.js');
  let componentsSrc = fs.readFileSync(componentsPath, 'utf8');
  const patchedComponents = componentsSrc.replace(
    /authScript\.src = 'js\/auth\.js(?:\?v=[a-z0-9]+)?';/,
    `authScript.src = 'js/auth.js?v=${authHash}';`
  );
  if (patchedComponents !== componentsSrc) {
    fs.writeFileSync(componentsPath, patchedComponents);
  }

  const hashes = {};
  for (const asset of ASSETS) {
    try {
      hashes[asset] = hashFile(asset);
    } catch {
      console.warn(`[cachebust] Skipping missing asset: ${asset}`);
    }
  }

  let filesChanged = 0;
  let totalSubs = 0;

  for (const htmlFile of findHtmlFiles(ROOT)) {
    let content = fs.readFileSync(htmlFile, 'utf8');
    const original = content;
    for (const [asset, hash] of Object.entries(hashes)) {
      const re = new RegExp(`(src|href)="${escapeRe(asset)}(?:\\?v=[a-z0-9]+)?"`, 'g');
      content = content.replace(re, (_m, attr) => {
        totalSubs++;
        return `${attr}="${asset}?v=${hash}"`;
      });
    }
    if (content !== original) {
      fs.writeFileSync(htmlFile, content);
      filesChanged++;
    }
  }

  console.log(`[cachebust] ${filesChanged} HTML files updated, ${totalSubs} references versioned.`);
}

main();
