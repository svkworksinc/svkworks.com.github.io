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
  'fuel-pump-relay-kit':              'fuel-pump-relay-kit.html',
  'fan-relay-kit':                    'fan-relay-kit.html',
  'sequoia-alternator-adapter':       'sequoia-alternator-adapter.html',
  '2jz-power-steering-delete':        '2jz-power-steering-delete.html',
  '1uz-3uz-power-steering-delete':    '1uz-3uz-power-steering-delete.html',
};

// Static products with their own dedicated pages that are not in Supabase.
const STATIC_PRODUCTS = [
  {
    id: 'sequoia-alternator-adapter',
    title: 'Sequoia / Tundra 2UZ Alternator Adapter Harness for 2JZ & 1UZ',
    description: 'Plug-and-play adapter harness that allows the Toyota Sequoia or Tundra 2UZ-FE high-output alternator to connect to the stock 2JZ-GTE or 1UZ-FE alternator wiring connector. No cutting or splicing required. Compatible with MK4 Supra (JZA80), MK3 Supra (MA70), SC300, SC400, IS300, GS300, and any 2JZ or 1UZ swap build.',
    link: `${SITE_URL}/sequoia-alternator-adapter.html`,
    image: `${SITE_URL}/img/alternator1.webp`,
    additionalImages: [
      `${SITE_URL}/img/alternator2.webp`,
      `${SITE_URL}/img/alternator3.webp`,
    ],
    price: 25.00,
    condition: 'new',
    mpn: 'SVK-ALT-ADAPTER-2UZ',
    sku: 'SVK-ALT-ADAPTER-2UZ',
    googleProductCategory: 'Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Electrical System Parts',
    productType: 'Alternator Adapter Harnesses',
    highlights: [
      'Plug-and-play — no cutting or splicing required',
      'Connects Sequoia/Tundra 2UZ-FE alternator to stock 2JZ or 1UZ connector',
      'Compatible with MK4 Supra, MK3 Supra, SC300, SC400, IS300, GS300',
      'OEM-quality terminals and weatherproof connectors',
      'Hand-assembled and tested at SVK Works',
    ],
    weightOz: 3,
  },
  {
    id: '2jz-power-steering-delete',
    title: '2JZ Power Steering Delete Kit | SVK Works',
    description: 'Complete power steering delete kit for 2JZ-GTE and 2JZ-GE engines (VVT-i and Non-VVT-i). Includes billet aluminum idler pulley, aluminum spacers, and a new accessory belt sized for the delete configuration. Keeps A/C fully functional. Bolt-on installation, no fabrication required.',
    link: `${SITE_URL}/2jz-power-steering-delete.html`,
    image: `${SITE_URL}/img/filler.webp`,
    price: 89.00,
    condition: 'new',
    mpn: 'SVK-2JZ-PSDELETE',
    sku: 'SVK-2JZ-PSDELETE',
    googleProductCategory: 'Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Engine &amp; Engine Parts',
    productType: 'Power Steering Delete Kits',
    highlights: [
      'Billet aluminum idler pulley included',
      'Aluminum spacers and all hardware included',
      'New accessory belt (delete length) included',
      'A/C compressor fully retained',
      'Fits 2JZ-GTE and 2JZ-GE — VVT-i and Non-VVT-i',
      'Compatible with MK4 Supra, MK3 Supra, IS300, GS300, SC300, and swap builds',
      'Bolt-on installation — no fabrication required',
    ],
    weightOz: 24,
  },
  {
    id: '1uz-3uz-power-steering-delete',
    title: '1UZ / 3UZ Power Steering Delete Kit | SVK Works',
    description: 'Power steering delete kit for 1UZ-FE and 3UZ-FE engines. Includes a billet aluminum bracket, mounting bolts, and an idler pulley to replace the power steering pump. Optional accessory belt available. Keeps A/C fully functional. Bolt-on installation for SC400, SC430, LS400, LS430, GS400, GS430, and swap applications.',
    link: `${SITE_URL}/1uz-3uz-power-steering-delete.html`,
    image: `${SITE_URL}/img/1UZ%203UZ%20Power%20Steering%20Delete%201.webp`,
    additionalImages: [
      `${SITE_URL}/img/1UZ%203UZ%20Power%20Steering%20Delete%202.webp`,
      `${SITE_URL}/img/1UZ%203UZ%20Power%20Steering%20Delete%203.webp`,
      `${SITE_URL}/img/1UZ%203UZ%20Power%20Steering%20Delete%204.webp`,
      `${SITE_URL}/img/1UZ%203UZ%20Power%20Steering%20Delete%205.webp`,
      `${SITE_URL}/img/1UZ%203UZ%20Power%20Steering%20Delete%206.webp`,
    ],
    price: 190.00,
    condition: 'new',
    mpn: 'SVK-1UZ3UZ-PSDELETE',
    sku: 'SVK-1UZ3UZ-PSDELETE',
    googleProductCategory: 'Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Engine &amp; Engine Parts',
    productType: 'Power Steering Delete Kits',
    highlights: [
      'Billet aluminum bracket mounts to OEM PS pump location',
      'Idler pulley included',
      'All mounting bolts and hardware included',
      'Optional accessory belt available — contact for fitment',
      'A/C compressor fully retained',
      'Fits 1UZ-FE and 3UZ-FE engines',
      'Compatible with SC400, SC430, LS400, LS430, GS400, GS430, and 1UZ/3UZ swap builds',
      'Bolt-on installation — no fabrication required',
    ],
    weightOz: 24,
  },
];

function staticProductItem(product) {
  const extraImages = (product.additionalImages || [])
    .map((img) => `\n    <g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`)
    .join('');

  const highlights = (product.highlights || [])
    .slice(0, 10)
    .map((h) => `\n    <g:product_highlight>${cdata(h)}</g:product_highlight>`)
    .join('');

  return `
  <item>
    <g:id>static-${xmlEscape(product.id)}</g:id>
    <title>${cdata(product.title)}</title>
    <description>${cdata(product.description)}</description>
    <link>${xmlEscape(product.link)}</link>
    <g:image_link>${xmlEscape(product.image)}</g:image_link>${extraImages}
    <g:availability>in stock</g:availability>
    <g:price>${Number(product.price).toFixed(2)} USD</g:price>
    <g:condition>${xmlEscape(product.condition)}</g:condition>
    <g:brand>SVK Works</g:brand>
    <g:mpn>${xmlEscape(product.mpn)}</g:mpn>
    <g:identifier_exists>yes</g:identifier_exists>
    <g:google_product_category>${product.googleProductCategory}</g:google_product_category>
    <g:product_type>${cdata(product.productType)}</g:product_type>${highlights}
    <g:shipping_weight>${Number(product.weightOz || 4)} oz</g:shipping_weight>
  </item>`;
}

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

  // Google matches auto parts primarily on brand + MPN when there's no GTIN
  // (these are OEM-replacement parts, so no manufacturer barcode exists).
  // Supplying a real identifier pair is far stronger than identifier_exists=no,
  // which tells Google the item can't be matched to anything at all.
  const mpn = product.mpn || `SVK-${String(product.id).toUpperCase()}`;

  // Additional images (Merchant Center allows up to 10) — more imagery is a
  // ranking/quality signal and gives Shopping more to render.
  const extraImages = (product.images || []).slice(1, 11)
    .map((img) => `\n    <g:additional_image_link>${xmlEscape(`${SITE_URL}/${encodeURI(img)}`)}</g:additional_image_link>`)
    .join('');

  // Free-text merchandising bullets shown on the Shopping listing.
  const highlights = (product.highlights || [])
    .slice(0, 10)
    .map((h) => `\n    <g:product_highlight>${cdata(h)}</g:product_highlight>`)
    .join('');

  return `
  <item>
    <g:id>connector-${xmlEscape(product.id)}</g:id>
    <title>${cdata(product.feedTitle || product.name)}</title>
    <description>${cdata(product.feedDescription || product.description || product.shortDesc || product.name)}</description>
    <link>${xmlEscape(link)}</link>
    <g:image_link>${xmlEscape(imageLink)}</g:image_link>${extraImages}
    <g:availability>${product.inStock === false ? 'out of stock' : 'in stock'}</g:availability>
    <g:price>${Number(product.price).toFixed(2)} USD</g:price>
    <g:condition>new</g:condition>
    <g:brand>SVK Works</g:brand>
    <g:mpn>${xmlEscape(mpn)}</g:mpn>
    <g:identifier_exists>yes</g:identifier_exists>
    <g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories</g:google_product_category>
    <g:product_type>${cdata(product.productType || 'Connectors')}</g:product_type>${highlights}
    <g:shipping_weight>${Number(product.weightOz || 4)} oz</g:shipping_weight>
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
      ...STATIC_PRODUCTS.map(staticProductItem),
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
