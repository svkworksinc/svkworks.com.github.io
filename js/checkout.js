/* ============================================
   SVK Works — Checkout Page Logic
   ============================================ */

const SVKCheckout = {
  cart: [],
  subtotal: 0,
  supabaseOrderId: null,
  orderNumber: null,
  paymentMethod: 'paypal', // 'paypal' | 'card'
  stripeClientSecret: null,
  stripeInstance: null,
  shippingOptionId: null,

  SHIPPING_OPTIONS: [
    { id: 'usps-ground',   label: 'USPS Ground Advantage', desc: '5–8 business days', price: 12.95 },
    { id: 'usps-priority', label: 'USPS Priority Mail',     desc: '2–3 business days', price: 19.95 },
    { id: 'ups-ground',    label: 'UPS Ground',             desc: '3–5 business days', price: 24.95 },
    { id: 'ups-2day',      label: 'UPS 2-Day Air',          desc: '2 business days',   price: 65.00 },
    { id: 'ups-overnight', label: 'UPS Next Day Air',       desc: '1 business day',    price: 125.00 },
  ],
  TX_TAX_RATE: 0.0825,

  init() {
    this.cart = (typeof SVKCart !== 'undefined') ? SVKCart.getCart() : this._readCart();
    if (!this.cart.length) {
      window.location.href = 'cart.html';
      return;
    }
    this.subtotal = this.cart.reduce((s, i) => s + i.price * i.quantity, 0);
    this._renderSummary();
    this._renderShippingOptions();
    this._bindTabs();
    this._bindShippingOptions();
    this._bindStateChange();
    this._bindContinueBtn();
    this._prefillAuth();
    this._updateTotals();
  },

  _readCart() {
    try { return JSON.parse(localStorage.getItem('svk_cart')) || []; }
    catch { return []; }
  },

  _renderSummary() {
    const el = document.getElementById('checkout-items');
    if (!el) return;
    el.innerHTML = this.cart.map(item => {
      const opts = Object.entries(item.options || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
      return `<div class="checkout-item">
        <img src="${item.image}" alt="${item.name}" class="checkout-item-img" loading="lazy">
        <div class="checkout-item-info">
          <div class="checkout-item-name">${item.name}</div>
          ${opts ? `<div class="checkout-item-opts">${opts}</div>` : ''}
        </div>
        <div class="checkout-item-price">$${(item.price * item.quantity).toLocaleString()}</div>
      </div>`;
    }).join('');
  },

  _renderShippingOptions() {
    const el = document.getElementById('shipping-options');
    if (!el) return;
    el.innerHTML = this.SHIPPING_OPTIONS.map((opt, i) => `
      <label class="ship-option" data-ship-id="${opt.id}">
        <input type="radio" name="shipping-method" value="${opt.id}" ${i === 0 ? 'checked' : ''}>
        <span class="ship-option-label">
          <span class="ship-option-name">${opt.label}</span>
          <span class="ship-option-desc">${opt.desc}</span>
        </span>
        <span class="ship-option-price">$${opt.price.toFixed(2)}</span>
      </label>
    `).join('');
    this.shippingOptionId = this.SHIPPING_OPTIONS[0].id;
    el.querySelector('.ship-option')?.classList.add('selected');
  },

  _bindShippingOptions() {
    document.querySelectorAll('#shipping-options .ship-option').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('#shipping-options .ship-option').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        label.querySelector('input[type="radio"]').checked = true;
        this.shippingOptionId = label.dataset.shipId;
        this._updateTotals();
      });
    });
  },

  _bindStateChange() {
    document.getElementById('ship-state')?.addEventListener('change', () => this._updateTotals());
  },

  _getShippingOption() {
    return this.SHIPPING_OPTIONS.find(o => o.id === this.shippingOptionId) || this.SHIPPING_OPTIONS[0];
  },

  _updateTotals() {
    const shipOpt = this._getShippingOption();
    const shipping = shipOpt ? shipOpt.price : 0;
    const state = (document.getElementById('ship-state')?.value || '').trim().toUpperCase();
    const taxBase = this.subtotal + shipping;
    const tax = state === 'TX' ? Math.round(taxBase * this.TX_TAX_RATE * 100) / 100 : 0;
    const grandTotal = Math.round((this.subtotal + shipping + tax) * 100) / 100;

    const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const subEl = document.getElementById('sum-subtotal');
    const shipEl = document.getElementById('sum-shipping');
    const taxEl = document.getElementById('sum-tax');
    const totalEl = document.getElementById('checkout-total');

    if (subEl) subEl.textContent = fmt(this.subtotal);
    if (shipEl) shipEl.textContent = shipOpt ? fmt(shipping) : 'Select method';
    if (taxEl) taxEl.textContent = fmt(tax);
    if (totalEl) totalEl.textContent = fmt(grandTotal);

    return { shipping, tax, grandTotal };
  },

  _getShippingAddress() {
    return {
      address: document.getElementById('ship-address')?.value.trim() || '',
      city: document.getElementById('ship-city')?.value.trim() || '',
      state: document.getElementById('ship-state')?.value.trim() || '',
      zip: document.getElementById('ship-zip')?.value.trim() || '',
    };
  },

  _bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.tab;
        this.paymentMethod = method;
        document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === method));
        document.querySelectorAll('[data-tab-panel]').forEach(p => {
          p.style.display = p.dataset.tabPanel === method ? 'block' : 'none';
        });
      });
    });
  },

  _bindContinueBtn() {
    document.getElementById('continue-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('customer-name').value.trim();
      const email = document.getElementById('customer-email').value.trim();
      const notes = document.getElementById('customer-notes').value.trim();
      const shippingAddress = this._getShippingAddress();

      if (!name || !email) {
        this._setError('Please enter your name and email address.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this._setError('Please enter a valid email address.');
        return;
      }
      if (!shippingAddress.address || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
        this._setError('Please complete your shipping address.');
        document.getElementById('ship-address')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!this.shippingOptionId) {
        this._setError('Please select a shipping method.');
        return;
      }

      this._setError('');
      this._setLoading(true);

      if (this.paymentMethod === 'paypal') {
        await this._initPayPal(name, email, notes, shippingAddress);
      } else {
        await this._initStripe(name, email, notes, shippingAddress);
      }

      this._setLoading(false);
    });
  },

  async _prefillAuth() {
    if (typeof SVKAuth === 'undefined') return;
    await SVKAuth.ready;
    if (!SVKAuth.configured) return;
    const session = await SVKAuth.getSession();
    if (!session) return;
    const emailEl = document.getElementById('customer-email');
    if (emailEl && !emailEl.value) emailEl.value = session.user.email;
    const profile = await SVKAuth.getProfile().catch(() => null);
    const nameEl = document.getElementById('customer-name');
    if (nameEl && !nameEl.value && profile?.full_name) nameEl.value = profile.full_name;
  },

  async _initPayPal(name, email, notes, shippingAddress) {
    try {
      const res = await fetch('/.netlify/functions/create-paypal-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItems: this.cart,
          customerName: name,
          customerEmail: email,
          customerNotes: notes,
          shippingOptionId: this.shippingOptionId,
          shippingAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create PayPal order.');

      this.supabaseOrderId = data.supabaseOrderId;
      this.orderNumber = data.orderNumber;

      document.getElementById('customer-form-section').style.display = 'none';
      document.getElementById('payment-section').style.display = 'block';
      document.getElementById('payment-heading').textContent = 'Pay with PayPal';
      document.getElementById('paypal-container').style.display = 'block';

      await this._loadScript(
        `https://www.paypal.com/sdk/js?client-id=${window.PAYPAL_CLIENT_ID}&currency=USD&intent=capture`,
        'paypal-sdk'
      );

      window.paypal.Buttons({
        createOrder: () => data.paypalOrderId,
        onApprove: async (approveData) => {
          this._setPaymentLoading(true, 'Confirming payment…');
          try {
            const capRes = await fetch('/.netlify/functions/capture-paypal-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paypalOrderId: approveData.orderID, supabaseOrderId: this.supabaseOrderId }),
            });
            const capData = await capRes.json();
            if (!capRes.ok) throw new Error(capData.error || 'Payment capture failed.');

            sessionStorage.setItem('svk_order_confirmation', JSON.stringify(capData.order));
            if (typeof SVKCart !== 'undefined') SVKCart.clearCart();
            window.location.href = 'order-confirmation.html';
          } catch (err) {
            this._setPaymentError(err.message);
            this._setPaymentLoading(false);
          }
        },
        onError: (err) => {
          console.error('PayPal error:', err);
          this._setPaymentError('Payment failed. Please try again or use a card.');
        },
      }).render('#paypal-buttons');
    } catch (err) {
      this._setError(err.message);
    }
  },

  async _initStripe(name, email, notes, shippingAddress) {
    try {
      const res = await fetch('/.netlify/functions/create-stripe-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItems: this.cart,
          customerName: name,
          customerEmail: email,
          customerNotes: notes,
          shippingOptionId: this.shippingOptionId,
          shippingAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initialize payment.');

      this.supabaseOrderId = data.supabaseOrderId;
      this.orderNumber = data.orderNumber;
      this.stripeClientSecret = data.clientSecret;

      const shipOpt = this._getShippingOption();
      sessionStorage.setItem('svk_order_preview', JSON.stringify({
        orderNumber: data.orderNumber,
        subtotal: data.subtotal,
        shipping: data.shipping,
        shippingLabel: shipOpt?.label,
        tax: data.tax,
        total: data.grandTotal,
        items: this.cart,
        customerName: name,
        customerEmail: email,
        shippingAddress,
        paymentMethod: 'Credit / Debit Card',
      }));

      document.getElementById('customer-form-section').style.display = 'none';
      document.getElementById('payment-section').style.display = 'block';
      document.getElementById('payment-heading').textContent = 'Enter Card Details';
      document.getElementById('stripe-container').style.display = 'block';

      await this._loadScript('https://js.stripe.com/v3/', 'stripe-sdk');

      this.stripeInstance = window.Stripe(window.STRIPE_PUBLISHABLE_KEY);
      const elements = this.stripeInstance.elements({ clientSecret: this.stripeClientSecret, appearance: {
        theme: 'night',
        variables: { colorPrimary: '#e91e8c', fontFamily: 'Inter, sans-serif', borderRadius: '6px' },
      }});
      const paymentElement = elements.create('payment');
      paymentElement.mount('#stripe-payment-element');

      document.getElementById('stripe-submit-btn').addEventListener('click', async () => {
        this._setPaymentLoading(true, 'Processing payment…');
        const { error } = await this.stripeInstance.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/order-confirmation.html`,
            payment_method_data: { billing_details: { name, email } },
          },
        });
        this._setPaymentLoading(false);
        if (error) this._setPaymentError(error.message);
      });
    } catch (err) {
      this._setError(err.message);
    }
  },

  _loadScript(src, id) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.id = id;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  },

  _setLoading(on) {
    const btn = document.getElementById('continue-btn');
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? 'Setting up payment…' : 'Continue to Payment';
  },

  _setPaymentLoading(on, msg) {
    const btn = document.getElementById('stripe-submit-btn');
    if (btn) { btn.disabled = on; btn.textContent = on ? (msg || 'Processing…') : 'Pay Now'; }
    const loader = document.getElementById('payment-loading');
    if (loader) loader.style.display = on ? 'block' : 'none';
  },

  _setError(msg) {
    const el = document.getElementById('checkout-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  },

  _setPaymentError(msg) {
    const el = document.getElementById('payment-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  },
};

document.addEventListener('DOMContentLoaded', () => SVKCheckout.init());
