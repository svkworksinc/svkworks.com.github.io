/* ============================================
   SVK Works — Product Data Manager
   Fetches and renders products from products.json
   ============================================ */

const SVKProducts = {
  data: null,

  async load() {
    if (this.data) return this.data;
    // Use global data from products-data.js (works on file:// protocol)
    if (typeof SVK_PRODUCTS_DATA !== 'undefined') {
      this.data = SVK_PRODUCTS_DATA;
      return this.data;
    }
    // Fallback to fetch for server environments
    try {
      const res = await fetch('data/products.json');
      if (!res.ok) throw new Error('Failed to load products');
      this.data = await res.json();
      return this.data;
    } catch (err) {
      console.error('Error loading products:', err);
      return { products: [], categories: [], resources: [], blogs: [], builds: [] };
    }
  },

  getProducts(filter = {}) {
    if (!this.data) return [];
    let products = [...this.data.products];

    if (filter.category) {
      products = products.filter(p => p.category === filter.category);
    }
    if (filter.engine) {
      products = products.filter(p => p.engine === filter.engine);
    }
    if (filter.featured) {
      products = products.filter(p => p.featured);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.shortDesc.toLowerCase().includes(q) ||
        p.engine.toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q))
      );
    }

    // Sort
    if (filter.sort === 'price-asc') {
      products.sort((a, b) => a.price - b.price);
    } else if (filter.sort === 'price-desc') {
      products.sort((a, b) => b.price - a.price);
    } else if (filter.sort === 'name') {
      products.sort((a, b) => a.name.localeCompare(b.name));
    }

    return products;
  },

  getProduct(id) {
    if (!this.data) return null;
    return this.data.products.find(p => p.id === id) || null;
  },

  renderProductCard(product) {
    return `
      <div class="product-card fade-in" data-product-id="${product.id}">
        <div class="product-card-image">
          <img src="${product.image}" alt="${product.name}" loading="lazy">
          ${product.badge ? `<span class="product-card-badge badge">${product.badge}</span>` : ''}
        </div>
        <div class="product-card-body">
          <h3 class="product-card-title">
            <a href="${product.page || 'product.html?id=' + product.id}">${product.name}</a>
          </h3>
          <p class="product-card-desc">${product.shortDesc}</p>
          <div class="product-card-footer">
            <span class="product-card-price">${SVKCart.formatPrice(product.price)}</span>
            <button class="add-to-cart-btn" data-product-id="${product.id}" aria-label="Add to cart">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderProductGrid(products, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (products.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3>No products found</h3>
          <p>Try adjusting your search or filters.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(p => this.renderProductCard(p)).join('');
    this.bindAddToCart(container);
    SVKMain.observeAnimations();
  },

  bindAddToCart(container) {
    container.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.productId;
        const product = this.getProduct(id);
        if (product) {
          SVKCart.addItem(product);
        }
      });
    });
  },

  // Render the product detail page
  renderProductDetail(productId) {
    const product = this.getProduct(productId);
    const container = document.getElementById('product-detail-content');
    if (!product || !container) return;

    document.title = `${product.name} — SVK Works`;

    // Build options HTML
    let optionsHtml = '';
    if (product.options && Object.keys(product.options).length > 0) {
      optionsHtml = '<div class="product-options">';
      for (const [key, values] of Object.entries(product.options)) {
        optionsHtml += `
          <div class="product-option-group">
            <label>${key}</label>
            <div class="option-buttons" data-option="${key}">
              ${values.map((v, i) => `<button class="option-btn ${i === 0 ? 'selected' : ''}" data-value="${v}">${v}</button>`).join('')}
            </div>
          </div>
        `;
      }
      optionsHtml += '</div>';
    }

    // Build specs HTML
    let specsHtml = '';
    if (product.specs) {
      specsHtml = '<div class="product-specs"><h3>Specifications</h3>';
      for (const [key, value] of Object.entries(product.specs)) {
        specsHtml += `<div class="spec-row"><span class="spec-label">${key}</span><span class="spec-value">${value}</span></div>`;
      }
      specsHtml += '</div>';
    }

    // Category name for breadcrumb
    const catNames = { 'mk4-supra': 'MK4 Supra', 'mk3-supra': 'MK3 Supra', 'other': 'Other Parts' };
    const catPages = { 'mk4-supra': 'mk4-supra.html', 'mk3-supra': 'mk3-supra.html', 'other': 'other-parts.html' };

    container.innerHTML = `
      <div class="page-hero">
        <div class="container">
          <div class="breadcrumb">
            <a href="index.html">Home</a><span class="breadcrumb-sep">/</span>
            <a href="harnesses.html">Harnesses</a><span class="breadcrumb-sep">/</span>
            <a href="${catPages[product.category] || 'harnesses.html'}">${catNames[product.category] || 'Products'}</a><span class="breadcrumb-sep">/</span>
            <span>${product.name}</span>
          </div>
        </div>
      </div>
      <div class="product-detail">
        <div class="container">
          <div class="product-detail-layout">
            <div class="product-gallery">
              <div class="product-gallery-main">
                <img src="${product.image}" alt="${product.name}" id="product-main-image">
              </div>
            </div>
            <div class="product-info">
              ${product.badge ? `<span class="badge">${product.badge}</span>` : ''}
              <h1>${product.name}</h1>
              <div class="product-price-block">
                <span class="product-price-current">${SVKCart.formatPrice(product.price)}</span>
              </div>
              <p class="product-description">${product.description}</p>
              ${optionsHtml}
              <div class="product-add-actions">
                <button class="btn btn-primary btn-lg" id="add-to-cart-detail">Add to Cart</button>
                <a href="contact.html" class="btn btn-outline btn-lg">Custom Quote</a>
              </div>
              <div style="display:flex;gap:var(--space-lg);margin-top:var(--space-md);">
                <span class="badge ${product.inStock ? 'badge-success' : ''}">${product.inStock ? 'In Stock / Made to Order' : 'Contact for Availability'}</span>
              </div>
              ${specsHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    // Option button selection
    container.querySelectorAll('.option-buttons').forEach(group => {
      group.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    });

    // Add to cart
    const addBtn = document.getElementById('add-to-cart-detail');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const selectedOptions = {};
        container.querySelectorAll('.option-buttons').forEach(group => {
          const key = group.dataset.option;
          const selected = group.querySelector('.option-btn.selected');
          if (selected) selectedOptions[key] = selected.dataset.value;
        });
        SVKCart.addItem(product, 1, selectedOptions);
      });
    }
  }
};
