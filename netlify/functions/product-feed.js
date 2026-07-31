// Google Merchant Center / Google Shopping product feed.
// Served at /product-feed.xml (see netlify.toml redirect).
//
// Covers the Used Parts and Parts Catalog systems (Supabase-backed and
// admin-managed) plus the static connector listings from
// data/products-data.js. The rest of the static catalog (harnesses,
// merchandise) already has its own hand-built SEO pages and isn't included
// here.
const { createClient } = require('@supabase/supabase-js');
const SVK_PRODUCTS_DATA = require('../../data/products-data.js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = 'https://www.svkworks.com';

const DEDICATED_PAGES = {
  'fuel-pump-relay-kit': 'fuel-pump-relay-kit.html',
  'fan-relay-kit': 'fan-relay-kit.html',
};

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(str) {
  return `<![CDATA[${String(str || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function usedPartItem(part) {
  const link = `${SITE_URL}/used-part.html?id=${part.id}`;
  const image = (part.images && part.images[0]) || '';
  if (!image) return ''; // Merchant Center requires an image; skip listings without one
  const condition = part.condition === 'open_box_new' ? 'new' : 'used';
  return `
  <item>
    <g:id>used-${xmlEscape(part.id)}</g:id>
    <title>${cdata(part.title)}</title>
    <description>${cdata(part.description || part.title)}</description>
    <link>${xmlEscape(link)}</link>
    <g:image_link>${xmlEscape(image)}</g:image_link>
    <g:availability>in stock</g:availability>
    <g:price>${Number(part.price).toFixed(2)} USD</g:price>
    <g:condition>${condition}</g:condition>
    <g:brand>SVK Works</g:brand>
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories</g:google_product_category>
  </item>`;
}

function catalogPartItem(part) {
  const page = (part.slug && DEDICATED_PAGES[part.slug]) || `part.html?id=${part.id}`;
  const link = `${SITE_URL}/${page}`;
  const image = (part.images && part.images[0]) || '';
  if (!image) return '';
  return `
  <item>
    <g:id>catalog-${xmlEscape(part.id)}</g:id>
    <title>${cdata(part.title)}</title>
    <description>${cdata(part.description || part.title)}</description>
    <link>${xmlEscape(link)}</link>
    <g:image_link>${xmlEscape(image)}</g:image_link>
    <g:availability>in stock</g:availability>
    <g:price>${Number(part.price).toFixed(2)} USD</g:price>
    <g:condition>new</g:condition>
    <g:brand>SVK Works</g:brand>
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories</g:google_product_category>
  </item>`;
}

function connectorItem(product) {
  const image = product.images && product.images[0];
  if (!image || !product.page) return '';
  const link = `${SITE_URL}/${product.page}`;
  const imageLink = `${SITE_URL}/${encodeURI(image)}`;
  return `
  <item>
    <g:id>connector-${xmlEscape(product.id)}</g:id>
    <title>${cdata(product.name)}</title>
    <description>${cdata(product.description || product.shortDesc || product.name)}</description>
    <link>${xmlEscape(link)}</link>
    <g:image_link>${xmlEscape(imageLink)}</g:image_link>
    <g:availability>${product.inStock === false ? 'out of stock' : 'in stock'}</g:availability>
    <g:price>${Number(product.price).toFixed(2)} USD</g:price>
    <g:condition>new</g:condition>
    <g:brand>SVK Works</g:brand>
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories</g:google_product_category>
  </item>`;
}

exports.handler = async () => {
  try {
    const [usedPartsRes, catalogPartsRes] = await Promise.all([
      supabase
        .from('used_parts')
        .select('id, title, description, price, condition, images, status')
        .eq('status', 'available')
        // "junk" listings aren't sellable, functioning products — keep them off Shopping.
        .neq('condition', 'junk'),
      supabase
        .from('parts_catalog')
        .select('id, title, description, price, slug, images, status')
        .eq('status', 'available'),
    ]);

    if (usedPartsRes.error) throw new Error(`used_parts query failed: ${usedPartsRes.error.message}`);
    if (catalogPartsRes.error) throw new Error(`parts_catalog query failed: ${catalogPartsRes.error.message}`);

    const connectors = (SVK_PRODUCTS_DATA.products || []).filter((p) => p.category === 'connectors');

    const items = [
      ...(usedPartsRes.data || []).map(usedPartItem),
      ...(catalogPartsRes.data || []).map(catalogPartItem),
      ...connectors.map(connectorItem),
    ].filter(Boolean).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title>SVK Works — Product Feed</title>
  <link>${SITE_URL}</link>
  <description>Used parts and catalog items available from SVK Works.</description>${items}
</channel>
</rss>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800', // 30 min — feed doesn't need to be second-fresh
      },
      body: xml,
    };
  } catch (err) {
    console.error('product-feed error:', err);
    return { statusCode: 500, body: `Feed generation failed: ${err.message}` };
  }
};
