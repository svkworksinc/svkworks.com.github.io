/* ============================================
   SVK Works — Search Engine
   Client-side search across products, blog, resources
   ============================================ */

const SVKSearch = {
  async performSearch(query) {
    const data = await SVKProducts.load();
    if (!query || query.trim().length === 0) return { products: [], blogs: [], resources: [], builds: [], parts: [] };

    const q = query.toLowerCase().trim();

    const products = data.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.shortDesc.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.engine.toLowerCase().includes(q) ||
      p.tags.some(t => t.includes(q))
    );

    const parts = await this._searchParts(q);

    const blogs = data.blogs.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.excerpt.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q)
    );

    const resources = data.resources.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
    );

    const builds = (data.builds || []).filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.specs       || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q) ||
      (b.tags        || []).some(t => t.toLowerCase().includes(q))
    );

    return { products, blogs, resources, builds, parts };
  },

  // Used Parts + Parts Catalog live in Supabase, not the static products-data
  // file, so they're searched separately and merged in as their own section.
  async _searchParts(q) {
    if (typeof SVKAuth === 'undefined' || !SVKAuth.configured) return [];
    const matches = (title, desc) => (title || '').toLowerCase().includes(q) || (desc || '').toLowerCase().includes(q);

    const [usedParts, catalogParts] = await Promise.all([
      SVKAuth.getUsedParts(),
      Promise.all(['3d-parts', 'other-parts', 'relay-power-kits'].map(c => SVKAuth.getPartsCatalog(c))).then(lists => lists.flat()),
    ]);

    const usedMatches = usedParts
      .filter(p => matches(p.title, p.description))
      .map(p => ({
        kind: 'used-part',
        id: p.id,
        title: p.title,
        description: p.description,
        image: (p.images && p.images[0]) || 'img/filler.webp',
        price: p.price,
        url: `used-part.html?id=${p.id}`,
        badge: typeof svkConditionBadge === 'function' ? svkConditionBadge(p.condition) : '',
      }));

    const catalogMatches = catalogParts
      .filter(p => p.status === 'available' && matches(p.title, p.description))
      .map(p => ({
        kind: 'catalog-part',
        id: p.id,
        title: p.title,
        description: p.description,
        image: (p.images && p.images[0]) || 'img/filler.webp',
        price: p.price,
        url: typeof svkCatalogPartUrl === 'function' ? svkCatalogPartUrl(p) : `part.html?id=${p.id}`,
        badge: '',
      }));

    return [...usedMatches, ...catalogMatches];
  },

  renderSearchResults(results, query) {
    const container = document.getElementById('search-results');
    if (!container) return;

    const totalResults = results.products.length + results.blogs.length + results.resources.length + (results.builds || []).length + (results.parts || []).length;

    let html = `<p class="text-secondary" style="margin-bottom:var(--space-xl);">Found <strong>${totalResults}</strong> results for "<strong>${this.escapeHtml(query)}</strong>"</p>`;

    if (totalResults === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3>No results found</h3>
          <p>Try a different search term, or browse our <a href="harnesses.html">product catalog</a>.</p>
        </div>
      `;
      container.innerHTML = html;
      return;
    }

    // Products
    if (results.products.length > 0) {
      html += `<h2 style="margin-bottom:var(--space-lg);">Products (${results.products.length})</h2>`;
      html += '<div class="product-grid" style="margin-bottom:var(--space-3xl);">';
      html += results.products.map(p => SVKProducts.renderProductCard(p)).join('');
      html += '</div>';
    }

    // Used Parts + Parts Catalog
    if ((results.parts || []).length > 0) {
      html += `<h2 style="margin-bottom:var(--space-lg);">Parts (${results.parts.length})</h2>`;
      html += '<div class="product-grid" style="margin-bottom:var(--space-3xl);">';
      html += results.parts.map(p => `
        <div class="product-card fade-in">
          <div class="product-card-image">
            <img src="${p.image}" alt="${p.title}" loading="lazy">
          </div>
          <div class="product-card-body">
            <h3 class="product-card-title"><a href="${p.url}">${p.title}</a></h3>
            <p class="product-card-desc">${(p.description || '').slice(0, 110)}${(p.description || '').length > 110 ? '…' : ''}</p>
            ${p.badge ? `<div style="margin-bottom:8px;">${p.badge}</div>` : ''}
            <div class="product-card-footer">
              <span class="product-card-price">${this.escapeHtml(String(Number(p.price || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })))}</span>
              <a href="${p.url}" class="btn btn-primary btn-sm">View</a>
            </div>
          </div>
        </div>`).join('');
      html += '</div>';
    }

    // Resources
    if (results.resources.length > 0) {
      html += `<h2 style="margin-bottom:var(--space-lg);">Resources (${results.resources.length})</h2>`;
      html += '<div style="display:flex;flex-direction:column;gap:var(--space-md);margin-bottom:var(--space-3xl);">';
      results.resources.forEach(r => {
        html += `
          <div class="resource-card">
            <div class="resource-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div class="resource-info">
              <h4>${r.title}</h4>
              <p>${r.description}</p>
            </div>
            <a href="${r.file}" class="btn btn-sm btn-outline resource-download" target="_blank">Download</a>
          </div>
        `;
      });
      html += '</div>';
    }

    // Blogs
    if (results.blogs.length > 0) {
      html += `<h2 style="margin-bottom:var(--space-lg);">Blog Posts (${results.blogs.length})</h2>`;
      html += '<div class="blog-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-xl);">';
      results.blogs.forEach(b => {
        html += `
          <div class="blog-card">
            <div class="blog-card-image"><img src="${b.image}" alt="${b.title}" loading="lazy"></div>
            <div class="blog-card-body">
              <div class="blog-card-meta"><span>${b.category}</span><span>${this.formatDate(b.date)}</span></div>
              <h3 class="blog-card-title"><a href="blog.html?post=${b.id}">${b.title}</a></h3>
              <p class="blog-card-excerpt">${b.excerpt}</p>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Builds
    if ((results.builds || []).length > 0) {
      html += `<h2 style="margin-bottom:var(--space-lg);">Builds (${results.builds.length})</h2>`;
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-xl);margin-bottom:var(--space-3xl);">';
      results.builds.forEach(b => {
        html += `
          <a href="${b.page || 'builds.html?build=' + b.id}" class="build-card fade-in" style="text-decoration:none;">
            <img class="build-card-image" src="${b.image}" alt="${b.title}" loading="lazy">
            <div class="build-card-overlay">
              <div class="build-card-title">${b.title}</div>
              <div class="build-card-specs">${b.specs}</div>
            </div>
          </a>
        `;
      });
      html += '</div>';
    }

    container.innerHTML = html;

    // Re-bind add-to-cart for product cards
    SVKProducts.bindAddToCart(container);
    SVKMain.observeAnimations();
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
};
