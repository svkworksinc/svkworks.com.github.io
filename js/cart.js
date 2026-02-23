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
    if (count > 0) {
      countEl.classList.add('visible');
    } else {
      countEl.classList.remove('visible');
    }
  },

  showToast(message) {
    // Remove existing toast
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

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  formatPrice(cents) {
    return '$' + (cents).toLocaleString('en-US', { minimumFractionDigits: 0 });
  },

  // Render the full cart page
  renderCartPage() {
    const cartContainer = document.getElementById('cart-items');
    const summaryContainer = document.getElementById('cart-summary-content');
    const emptyState = document.getElementById('cart-empty');
    const cartContent = document.getElementById('cart-content');

    if (!cartContainer) return;

    const cart = this.getCart();

    if (cart.length === 0) {
      if (cartContent) cartContent.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (cartContent) cartContent.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    cartContainer.innerHTML = cart.map(item => {
      const optionsText = Object.entries(item.options || {}).map(([k, v]) => `${k}: ${v}`).join(' | ');
      return `
        <div class="cart-item" data-id="${item.id}" data-options='${JSON.stringify(item.options || {})}'>
          <div class="cart-item-image">
            <img src="${item.image}" alt="${item.name}" loading="lazy">
          </div>
          <div class="cart-item-details">
            <h4>${item.name}</h4>
            ${optionsText ? `<div class="cart-item-variant">${optionsText}</div>` : ''}
            <div class="cart-item-price">${this.formatPrice(item.price)}</div>
          </div>
          <div class="cart-item-actions">
            <div class="quantity-control">
              <button class="quantity-btn" data-action="decrease" aria-label="Decrease quantity">&minus;</button>
              <span class="quantity-value">${item.quantity}</span>
              <button class="quantity-btn" data-action="increase" aria-label="Increase quantity">+</button>
            </div>
            <button class="cart-item-remove" data-action="remove">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    // Update summary
    const subtotal = this.getTotal();
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="cart-summary-row">
          <span class="label">Subtotal</span>
          <span class="amount">${this.formatPrice(subtotal)}</span>
        </div>
        <div class="cart-summary-row">
          <span class="label">Shipping</span>
          <span class="amount">Calculated at checkout</span>
        </div>
        <div class="cart-summary-row total">
          <span class="label">Total</span>
          <span class="amount">${this.formatPrice(subtotal)}</span>
        </div>
      `;
    }

    // Bind cart item events
    this.bindCartEvents();
  },

  bindCartEvents() {
    document.querySelectorAll('.cart-item').forEach(el => {
      const id = el.dataset.id;
      const options = JSON.parse(el.dataset.options || '{}');

      el.querySelector('[data-action="increase"]')?.addEventListener('click', () => {
        const cart = this.getCart();
        const optKey = JSON.stringify(options);
        const item = cart.find(i => i.id === id && JSON.stringify(i.options) === optKey);
        if (item) {
          this.updateQuantity(id, options, item.quantity + 1);
          this.renderCartPage();
        }
      });

      el.querySelector('[data-action="decrease"]')?.addEventListener('click', () => {
        const cart = this.getCart();
        const optKey = JSON.stringify(options);
        const item = cart.find(i => i.id === id && JSON.stringify(i.options) === optKey);
        if (item && item.quantity > 1) {
          this.updateQuantity(id, options, item.quantity - 1);
          this.renderCartPage();
        }
      });

      el.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
        this.removeItem(id, options);
        this.renderCartPage();
      });
    });
  }
};
