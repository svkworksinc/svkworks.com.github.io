/* ============================================
   SVK Works — Parts Catalog shared helpers
   Used by relay-power-kits.html, 3d-parts.html, other-parts.html,
   part.html, fuel-pump-relay-kit.html, fan-relay-kit.html,
   admin-parts-catalog.html
   ============================================ */

const SVK_SUBCATEGORIES = {
  '3d-parts':          { label: '3D Parts',           page: '3d-parts.html' },
  'other-parts':       { label: 'Other Parts',        page: 'other-parts.html' },
  'relay-power-kits':  { label: 'Relay & Power Kits',  page: 'relay-power-kits.html' },
};

// Items with a hand-built dedicated page (better SEO) instead of the generic
// part.html?id= fallback. Keyed by parts_catalog.slug.
const SVK_CATALOG_DEDICATED_PAGES = {
  'fuel-pump-relay-kit': 'fuel-pump-relay-kit.html',
  'fan-relay-kit':       'fan-relay-kit.html',
};

function svkSubcategoryInfo(subcategory) {
  return SVK_SUBCATEGORIES[subcategory] || { label: subcategory || 'Parts', page: 'other-parts.html' };
}

function svkFormatCatalogPrice(price) {
  return '$' + Number(price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function svkCatalogStatusBadge(status, extraStyle) {
  if (status === 'coming_soon') {
    return `<span class="badge" style="background:rgba(234,179,8,0.1);color:#eab308;border-color:rgba(234,179,8,0.3);${extraStyle || ''}">Coming Soon</span>`;
  }
  return `<span class="badge badge-success" style="${extraStyle || ''}">Available</span>`;
}

function svkCatalogPartUrl(part) {
  if (part.slug && SVK_CATALOG_DEDICATED_PAGES[part.slug]) return SVK_CATALOG_DEDICATED_PAGES[part.slug];
  return 'part.html?id=' + encodeURIComponent(part.id);
}

// Shared renderer/wiring for a single part's detail page. `lookup` is an
// async function that resolves the parts_catalog row to show (by ?id= on
// the generic page, or a fixed slug on a dedicated coming-soon page).
async function initPartDetail(lookup) {
  SVKAuth.init();
  await SVKAuth.ready;

  const part = await lookup();
  document.getElementById('part-loading').style.display = 'none';

  if (!part) {
    document.getElementById('part-not-found').style.display = 'block';
    return;
  }

  const sub = svkSubcategoryInfo(part.subcategory);
  document.title = `${part.title} — SVK Works`;
  document.getElementById('part-content').style.display = 'block';
  document.getElementById('part-breadcrumb-cat').textContent = sub.label;
  document.getElementById('part-breadcrumb-cat').href = sub.page;
  document.getElementById('part-breadcrumb-title').textContent = part.title;
  document.getElementById('part-title').textContent = part.title;
  document.getElementById('part-description').textContent = part.description || '';
  document.getElementById('part-status-badge').innerHTML = svkCatalogStatusBadge(part.status, 'font-size:13px;padding:5px 12px;');
  document.getElementById('back-link').href = sub.page;
  document.getElementById('back-link').textContent = `← Back to ${sub.label}`;

  const priceEl = document.getElementById('part-price');
  const btn = document.getElementById('add-to-cart-btn');

  if (part.status !== 'available') {
    priceEl.textContent = 'Coming Soon';
    btn.textContent = 'Coming Soon';
    btn.disabled = true;
  } else {
    priceEl.textContent = svkFormatCatalogPrice(part.price);
    const inCart = typeof SVKCart !== 'undefined' && SVKCart.getCart().some(i => i.id === part.id);
    if (inCart) {
      btn.textContent = 'In Cart — View Cart';
      btn.disabled = false;
      btn.onclick = () => { window.location.href = 'cart.html'; };
    } else {
      btn.textContent = `Add to Cart — ${svkFormatCatalogPrice(part.price)}`;
      btn.disabled = false;
      btn.onclick = () => {
        SVKCart.addItem({
          id: part.id,
          name: part.title,
          price: Number(part.price),
          image: (part.images && part.images[0]) || 'img/filler.webp',
          type: 'catalog-part',
        }, 1, {});
        initPartDetail(lookup); // re-render button state (In Cart)
      };
    }
  }

  const images = part.images && part.images.length ? part.images : ['img/filler.webp'];
  document.getElementById('part-main-image').src = images[0];
  document.getElementById('part-main-image').alt = part.title;
  document.getElementById('gallery-thumbs').innerHTML = images.length > 1
    ? images.map((src, i) => `
      <div class="product-thumb${i === 0 ? ' active' : ''}" onclick="document.getElementById('part-main-image').src='${src}';document.querySelectorAll('.product-thumb').forEach((t,idx)=>t.classList.toggle('active',idx===${i}))">
        <img src="${src}" alt="${part.title} view ${i + 1}" loading="lazy">
      </div>`).join('')
    : '';
}
