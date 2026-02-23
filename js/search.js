/* ============================================
   SVK Works — Search Engine
   Client-side search across products, blog, resources
   ============================================ */

const SVKSearch = {
  async performSearch(query) {
    const data = await SVKProducts.load();
    if (!query || query.trim().length === 0) return { products: [], blogs: [], resources: [] };

    const q = query.toLowerCase().trim();

    const products = data.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.shortDesc.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.engine.toLowerCase().includes(q) ||
      p.tags.some(t => t.includes(q))
    );

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

    return { products, blogs, resources };
  },

  renderSearchResults(results, query) {
    const container = document.getElementById('search-results');
    if (!container) return;

    const totalResults = results.products.length + results.blogs.length + results.resources.length;

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
