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
  'fuel-pump-relay-kit':              'fuel-pump-relay-kit.html',
  'fan-relay-kit':                    'fan-relay-kit.html',
  'sequoia-alternator-adapter':       'sequoia-alternator-adapter.html',
  '2jz-power-steering-delete':        '2jz-power-steering-delete.html',
  '1uz-3uz-power-steering-delete':    '1uz-3uz-power-steering-delete.html',
};

function svkSubcategoryInfo(subcategory) {
  return SVK_SUBCATEGORIES[subcategory] || { label: subcategory || 'Parts', page: 'other-parts.html' };
}

function svkFormatCatalogPrice(price) {
  return '$' + Number(price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function svkCatalogStatusBadge(status, extraStyle, stockQty) {
  const s = extraStyle || '';
  if (status === 'coming_soon')
    return `<span class="badge" style="background:rgba(234,179,8,0.1);color:#eab308;border-color:rgba(234,179,8,0.3);${s}">Coming Soon</span>`;
  if (status === 'out_of_stock')
    return `<span class="badge" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3);${s}">Out of Stock</span>`;
  if (status === 'back_order_only')
    return `<span class="badge" style="background:rgba(139,92,246,0.1);color:#8b5cf6;border-color:rgba(139,92,246,0.3);${s}">Back Order Only</span>`;
  if (status === 'limited_stock') {
    const label = stockQty != null ? `Limited Stock — ${stockQty} left` : 'Limited Stock';
    return `<span class="badge" style="background:rgba(249,115,22,0.1);color:#f97316;border-color:rgba(249,115,22,0.3);${s}">${label}</span>`;
  }
  const label = stockQty != null ? `In Stock — ${stockQty}` : 'In Stock';
  return `<span class="badge badge-success" style="${s}">${label}</span>`;
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
  document.getElementById('part-status-badge').innerHTML = svkCatalogStatusBadge(part.status, 'font-size:13px;padding:5px 12px;', part.stock_quantity);
  document.getElementById('back-link').href = sub.page;
  document.getElementById('back-link').textContent = `← Back to ${sub.label}`;

  const priceEl = document.getElementById('part-price');
  const btn = document.getElementById('add-to-cart-btn');

  const isPurchasable = part.status === 'available' || part.status === 'limited_stock';
  const isOutOfStock  = part.status === 'out_of_stock';
  const isBackOrder   = part.status === 'back_order_only';

  if (isPurchasable) {
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
  } else if (isBackOrder) {
    priceEl.textContent = svkFormatCatalogPrice(part.price);
    btn.textContent = 'Contact to Order';
    btn.disabled = false;
    btn.onclick = () => { window.location.href = 'contact.html'; };
  } else {
    priceEl.textContent = isOutOfStock ? 'Out of Stock' : 'Coming Soon';
    btn.textContent = isOutOfStock ? 'Out of Stock' : 'Coming Soon';
    btn.disabled = true;
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

  const seoAvailability = isPurchasable ? 'in_stock' : isOutOfStock ? 'sold_out' : isBackOrder ? 'back_order' : 'coming_soon';
  svkSyncProductSeo({
    id: part.id,
    title: part.title,
    description: part.description,
    image: images[0],
    price: isPurchasable || isBackOrder ? part.price : null,
    availability: seoAvailability,
  });
  svkBindShareButton('share-link-btn');
}

// ---- SEO / sharing helpers ----
// These keep <title>, meta description, canonical, Open Graph / Twitter tags,
// the robots directive, and Product JSON-LD in sync with a live catalog or
// used-part record, so admin-entered content stays accurate for search and
// social shares without any code changes.

function svkSetMeta(attr, key, content) {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function svkSetCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

function svkSetJsonLd(data) {
  let el = document.getElementById('product-jsonld');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'product-jsonld';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

// availability: 'in_stock' | 'coming_soon' | 'sold_out' | 'back_order'
function svkSyncProductSeo({ id, title, description, image, price, availability, condition = 'new' }) {
  const url = window.location.origin + window.location.pathname + window.location.search;
  const desc = (description && description.trim()) || `${title} — available from SVK Works.`;
  const truncDesc = desc.length > 300 ? desc.slice(0, 297) + '…' : desc;
  const absImage = image ? new URL(image, window.location.origin).href : (window.location.origin + '/img/svk-logo.png');

  if (id && typeof gtag === 'function') {
    gtag('event', 'view_item', {
      currency: 'USD',
      value: price || 0,
      items: [{ item_id: id, item_name: title, price: price || 0 }],
    });
  }

  document.title = `${title} — SVK Works`;
  svkSetMeta('name', 'description', truncDesc);
  svkSetCanonical(url);

  svkSetMeta('property', 'og:type', 'product');
  svkSetMeta('property', 'og:title', title);
  svkSetMeta('property', 'og:description', truncDesc);
  svkSetMeta('property', 'og:image', absImage);
  svkSetMeta('property', 'og:url', url);
  svkSetMeta('property', 'og:site_name', 'SVK Works');

  svkSetMeta('name', 'twitter:card', 'summary_large_image');
  svkSetMeta('name', 'twitter:title', title);
  svkSetMeta('name', 'twitter:description', truncDesc);
  svkSetMeta('name', 'twitter:image', absImage);

  // Only let real, purchasable listings into search results — a sold-out or
  // not-yet-launched item indexed forever just confuses shoppers.
  svkSetMeta('name', 'robots', availability === 'in_stock' ? 'index, follow' : 'noindex, follow');

  const schemaAvailability = {
    in_stock:     'https://schema.org/InStock',
    coming_soon:  'https://schema.org/PreOrder',
    sold_out:     'https://schema.org/OutOfStock',
    back_order:   'https://schema.org/BackOrder',
  }[availability] || 'https://schema.org/OutOfStock';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: truncDesc,
    image: absImage,
    url,
    brand: { '@type': 'Brand', name: 'SVK Works' },
    itemCondition: condition === 'used' ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition',
  };
  if (price !== undefined && price !== null) {
    jsonLd.offers = {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: Number(price).toFixed(2),
      availability: schemaAvailability,
      url,
    };
  }
  svkSetJsonLd(jsonLd);
}

// Wires a "Copy Link" button to copy the current page URL, confirmed via
// SVKCart's shared toast helper when available.
function svkBindShareButton(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (typeof SVKCart !== 'undefined' && SVKCart.showToast) SVKCart.showToast('Link copied!');
      else alert('Link copied: ' + window.location.href);
    } catch {
      alert(window.location.href);
    }
  });
}
