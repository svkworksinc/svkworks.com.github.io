// Dynamic sitemap for Used Parts and Parts Catalog listings — these come and
// go as the admin adds/sells/removes items, so they can't live in the
// hand-maintained sitemap.xml. Served at /sitemap-products.xml (see
// netlify.toml redirect) and referenced from robots.txt.
const { createClient } = require('@supabase/supabase-js');

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
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlEntry(loc, lastmod) {
  return `
  <url>
    <loc>${xmlEscape(loc)}</loc>
    ${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
  </url>`;
}

exports.handler = async () => {
  try {
    // Only listings that are actually indexable (see svkSyncProductSeo in
    // js/parts-catalog.js — sold/coming-soon items are set noindex client-side,
    // so keep this feed limited to the same "available" set.
    const [usedPartsRes, catalogPartsRes] = await Promise.all([
      supabase.from('used_parts').select('id, created_at').eq('status', 'available'),
      supabase.from('parts_catalog').select('id, slug, created_at').eq('status', 'available'),
    ]);

    if (usedPartsRes.error) throw new Error(usedPartsRes.error.message);
    if (catalogPartsRes.error) throw new Error(catalogPartsRes.error.message);

    const usedUrls = (usedPartsRes.data || [])
      .map(p => urlEntry(`${SITE_URL}/used-part.html?id=${p.id}`, p.created_at));

    const catalogUrls = (catalogPartsRes.data || [])
      .map(p => urlEntry(`${SITE_URL}/${(p.slug && DEDICATED_PAGES[p.slug]) || `part.html?id=${p.id}`}`, p.created_at));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${usedUrls.join('')}${catalogUrls.join('')}
</urlset>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',
      },
      body: xml,
    };
  } catch (err) {
    console.error('sitemap-products error:', err);
    return { statusCode: 500, body: `Sitemap generation failed: ${err.message}` };
  }
};
