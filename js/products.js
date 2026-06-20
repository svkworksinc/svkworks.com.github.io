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
    const isWishlisted = typeof SVKWishlist !== 'undefined' && SVKWishlist.has(product.id);
    return `
      <div class="product-card fade-in" data-product-id="${product.id}">
        <div class="product-card-image">
          <img src="${product.image}" alt="${product.name}" loading="lazy">
          ${product.badge ? `<span class="product-card-badge badge">${product.badge}</span>` : ''}
          <button class="wishlist-btn${isWishlisted ? ' active' : ''}" data-wishlist-id="${product.id}" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
        <div class="product-card-body">
          <h3 class="product-card-title">
            <a href="${product.page || 'product.html?id=' + product.id}">${product.name}</a>
          </h3>
          <p class="product-card-desc">${product.shortDesc}</p>
          <div class="product-card-footer">
            <span class="product-card-price">${product.price ? SVKCart.formatPrice(product.price) : 'Custom Order'}</span>
            ${product.price ? `<button class="add-to-cart-btn" data-product-id="${product.id}" aria-label="Add to cart" style="position:relative;z-index:2;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>` : ''}
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
        if (product) SVKCart.addItem(product);
      });
    });

    // Wishlist buttons (only if SVKWishlist is loaded)
    if (typeof SVKWishlist !== 'undefined') {
      container.querySelectorAll('.wishlist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id    = btn.dataset.wishlistId;
          const added = SVKWishlist.toggle(id);
          btn.classList.toggle('active', added);
          btn.querySelector('path').setAttribute('fill', added ? 'currentColor' : 'none');
          btn.setAttribute('aria-label', added ? 'Remove from wishlist' : 'Save to wishlist');
          SVKCart.showToast(added ? 'Saved to wishlist' : 'Removed from wishlist');
        });
      });
    }
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
              <div class="product-gallery-main" id="product-gallery-main">
                <img src="${product.image}" alt="${product.name}" id="product-main-image">
              </div>
              ${product.images && product.images.length > 1 ? `
              <div class="product-gallery-thumbs">
                ${product.images.map((src, i) => `
                  <div class="product-thumb${i === 0 ? ' active' : ''}" data-src="${src}">
                    <img src="${src}" alt="${product.name} view ${i + 1}" loading="lazy">
                  </div>`).join('')}
              </div>` : ''}
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

    // Related products
    const related = this.getProducts({ category: product.category })
      .filter(p => p.id !== productId)
      .slice(0, 3);
    if (related.length > 0) {
      container.insertAdjacentHTML('beforeend', `
        <div class="section" style="background:var(--bg-secondary);padding-top:var(--space-3xl);">
          <div class="container">
            <div class="account-section-header" style="margin-bottom:var(--space-xl);">
              <h2>Related Products</h2>
            </div>
            <div class="product-grid">${related.map(p => this.renderProductCard(p)).join('')}</div>
          </div>
        </div>
      `);
      this.bindAddToCart(container.querySelector('.product-grid'));
    }

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

    // Zoom + pan on main image
    const galleryMain = document.getElementById('product-gallery-main');
    const mainImg = document.getElementById('product-main-image');
    if (galleryMain && mainImg) {
      galleryMain.addEventListener('click', () => {
        galleryMain.classList.toggle('zoomed');
        if (!galleryMain.classList.contains('zoomed')) {
          mainImg.style.transformOrigin = '50% 50%';
        }
      });

      galleryMain.addEventListener('mousemove', (e) => {
        if (!galleryMain.classList.contains('zoomed')) return;
        const rect = galleryMain.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        mainImg.style.transformOrigin = `${x}% ${y}%`;
      });

      galleryMain.addEventListener('mousedown', () => {
        if (galleryMain.classList.contains('zoomed')) galleryMain.classList.add('grabbing');
      });

      galleryMain.addEventListener('mouseup', () => galleryMain.classList.remove('grabbing'));

      galleryMain.addEventListener('mouseleave', () => {
        galleryMain.classList.remove('grabbing');
        if (galleryMain.classList.contains('zoomed')) {
          mainImg.style.transformOrigin = '50% 50%';
        }
      });
    }

    // Thumbnail switching
    container.querySelectorAll('.product-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const src = thumb.dataset.src;
        if (mainImg) {
          mainImg.src = src;
          if (galleryMain) galleryMain.classList.remove('zoomed');
        }
        container.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }
};
