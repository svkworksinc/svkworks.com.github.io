/* ============================================
   SVK Works — Shopping Cart (localStorage)
   ============================================ */

const SVKCart = {
  STORAGE_KEY: 'svk_cart',

  getCart() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  saveCart(cart) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cart));
    this.updateCartCount();
  },

  addItem(product, quantity = 1, options = {}) {
    const cart = this.getCart();
    const optKey = JSON.stringify(options);
    const existing = cart.find(item => item.id === product.id && JSON.stringify(item.options) === optKey);

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: quantity,
        options: options
      });
    }

    this.saveCart(cart);
    this.showToast(`${product.name} added to cart`);
  },

  removeItem(id, options = {}) {
    let cart = this.getCart();
    const optKey = JSON.stringify(options);
    cart = cart.filter(item => !(item.id === id && JSON.stringify(item.options) === optKey));
    this.saveCart(cart);
  },

  updateQuantity(id, options, quantity) {
    const cart = this.getCart();
    const optKey = JSON.stringify(options);
    const item = cart.find(item => item.id === id && JSON.stringify(item.options) === optKey);
    if (item) {
      item.quantity = Math.max(1, quantity);
      this.saveCart(cart);
    }
  },

  getTotal() {
    return this.getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },

  getItemCount() {
    return this.getCart().reduce((sum, item) => sum + item.quantity, 0);
  },

  clearCart() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.updateCartCount();
  },

  updateCartCount() {
    const countEl = document.getElementById('cart-count');
    if (!countEl) return;
    const count = this.getItemCount();
    countEl.textContent = count;
    countEl.classList.toggle('visible', count > 0);
  },

  showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </span>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  formatPrice(amount) {
    return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _productUrl(id) {
    if (typeof SVK_PRODUCTS_DATA !== 'undefined') {
      const product = SVK_PRODUCTS_DATA.products.find(p => p.id === id);
      if (product) return product.page || ('product.html?id=' + product.id);
    }
    return 'product.html?id=' + encodeURIComponent(id);
  },

  // ---- Cart page rendering ----

  renderCartPage() {
    const cartBody = document.getElementById('cart-items');
    const emptyState = document.getElementById('cart-empty');
    const cartContent = document.getElementById('cart-content');
    if (!cartBody) return;

    const cart = this.getCart();

    if (cart.length === 0) {
      if (cartContent) cartContent.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (cartContent) cartContent.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    cartBody.innerHTML = cart.map(item => {
      const opts = Object.entries(item.options || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      const lineTotal = item.price * item.quantity;
      const url = this._productUrl(item.id);
      return `<tr data-id="${item.id}" data-options='${JSON.stringify(item.options || {})}'>
        <td class="col-remove">
          <button class="cart-remove-btn" data-action="remove" aria-label="Remove ${item.name}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
        <td class="col-product">
          <a class="cart-product-cell" href="${url}" style="text-decoration:none;color:inherit;">
            <img src="${item.image}" alt="${item.name}" class="cart-product-img" loading="lazy">
            <div>
              <div class="cart-product-name">${item.name}</div>
              ${opts ? `<div class="cart-product-opts">${opts}</div>` : ''}
            </div>
          </a>
        </td>
        <td class="col-price">${this.formatPrice(item.price)}</td>
        <td class="col-qty">
          <div class="qty-field">
            <button type="button" data-action="decrease" aria-label="Decrease quantity">−</button>
            <input type="number" class="qty-input" value="${item.quantity}" min="1" max="99"
              data-original="${item.quantity}" aria-label="Quantity for ${item.name}">
            <button type="button" data-action="increase" aria-label="Increase quantity">+</button>
          </div>
        </td>
        <td class="col-total"><span class="cart-line-total">${this.formatPrice(lineTotal)}</span></td>
      </tr>`;
    }).join('');

    this._updateSummary();
    this._bindTableEvents();
    this._bindActionButtons();
    this._bindCouponAndTerms();
  },

  _updateSummary() {
    const subtotal = this.getTotal();
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    if (subtotalEl) subtotalEl.textContent = this.formatPrice(subtotal);
    if (totalEl) totalEl.textContent = this.formatPrice(subtotal);
  },

  _bindTableEvents() {
    const updateBtn = document.getElementById('update-cart-btn');

    const checkForChanges = () => {
      const hasChanges = [...document.querySelectorAll('.qty-input')].some(
        i => parseInt(i.value) !== parseInt(i.dataset.original)
      );
      if (updateBtn) {
        updateBtn.disabled = !hasChanges;
        updateBtn.classList.toggle('has-changes', hasChanges);
      }
    };

    // Quantity input changed directly
    document.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('input', checkForChanges);
    });

    // +/- stepper buttons
    document.querySelectorAll('.cart-table [data-action="decrease"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.qty-field').querySelector('.qty-input');
        if (input && parseInt(input.value) > 1) {
          input.value = parseInt(input.value) - 1;
          checkForChanges();
        }
      });
    });

    document.querySelectorAll('.cart-table [data-action="increase"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.qty-field').querySelector('.qty-input');
        if (input) {
          input.value = parseInt(input.value) + 1;
          checkForChanges();
        }
      });
    });

    // Remove buttons
    document.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        const id = row.dataset.id;
        const options = JSON.parse(row.dataset.options || '{}');
        this.removeItem(id, options);
        this.renderCartPage();
      });
    });
  },

  _bindActionButtons() {
    const updateBtn = document.getElementById('update-cart-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        document.querySelectorAll('#cart-items tr').forEach(row => {
          const input = row.querySelector('.qty-input');
          if (!input) return;
          const id = row.dataset.id;
          const options = JSON.parse(row.dataset.options || '{}');
          const newQty = Math.max(1, parseInt(input.value) || 1);
          this.updateQuantity(id, options, newQty);
        });
        this.renderCartPage();
        this.showToast('Cart updated');
      });
    }

    const clearBtn = document.getElementById('clear-cart-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('Remove all items from your cart?')) return;
        this.clearCart();
        this.renderCartPage();
      });
    }
  },

  _bindCouponAndTerms() {
    // Coupon apply
    const applyBtn = document.getElementById('apply-coupon-btn');
    const couponMsg = document.getElementById('coupon-msg');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const code = (document.getElementById('coupon-input')?.value || '').trim();
        if (!couponMsg) return;
        if (!code) {
          couponMsg.style.display = 'block';
          couponMsg.style.color = '#f87171';
          couponMsg.textContent = 'Please enter a coupon code.';
          return;
        }
        couponMsg.style.display = 'block';
        couponMsg.style.color = '#34d399';
        couponMsg.textContent = `Coupon "${code}" will be applied at checkout.`;
      });
    }

    // Terms checkbox → unlock checkout button
    const termsCheck = document.getElementById('terms-check');
    const checkoutBtn = document.getElementById('checkout-btn');
    if (termsCheck && checkoutBtn) {
      termsCheck.addEventListener('change', () => {
        checkoutBtn.classList.toggle('locked', !termsCheck.checked);
      });
    }
  },

  // Legacy alias kept for compatibility
  bindCartEvents() {
    this._bindTableEvents();
  },
};
