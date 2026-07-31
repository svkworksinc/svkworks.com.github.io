/* ============================================
   SVK Works — Checkout Page Logic
   ============================================ */

const SVKCheckout = {
  cart: [],
  subtotal: 0,
  supabaseOrderId: null,
  orderNumber: null,
  userAccessToken: null, // set in _prefillAuth() when the shopper is signed in — lets checkout link the order to their account
  paymentMethod: 'paypal', // 'paypal' | 'card'
  stripeClientSecret: null,
  stripeInstance: null,
  shippingOptionId: null,
  shippingOptions: [],       // live rates (or flat-rate fallback) + the international option
  shippingRateSource: null,  // 'shippo' | 'flat'
  // Display-only mirror of the applied discount. The server re-resolves the
  // code on every payment call, so tampering with these changes nothing.
  discountCode: null,
  discount: 0,
  discountLabel: null,
  _shippingDebounceTimer: null,
  _shippingFetchToken: 0,
  _pendingShippingLabel: null,

  DRAFT_KEY: 'svk_checkout_draft',
  STRIPE_RESUME_KEY: 'svk_checkout_stripe_resume',
  FIELD_IDS: ['customer-name', 'customer-email', 'ship-address', 'ship-city', 'ship-state', 'ship-zip'],

  // Used only if the get-shipping-rates call itself fails (network/function down) —
  // mirrors the server-side flat-rate fallback in netlify/functions/_pricing.js.
  FLAT_RATE_FALLBACK: [
    { id: 'usps-ground',   label: 'USPS Ground Advantage', desc: '5–8 business days', price: 12.95 },
    { id: 'usps-priority', label: 'USPS Priority Mail',     desc: '2–3 business days', price: 19.95 },
    { id: 'ups-ground',    label: 'UPS Ground',             desc: '3–5 business days', price: 24.95 },
    { id: 'ups-2day',      label: 'UPS 2-Day Air',          desc: '2 business days',   price: 65.00 },
    { id: 'ups-overnight', label: 'UPS Next Day Air',       desc: '1 business day',    price: 125.00 },
  ],
  INTERNATIONAL_OPTION: { id: 'international', label: 'International Shipping', desc: 'Outside the US — quoted by email', price: null, international: true },

  TX_TAX_RATE: 0.0825,

  async init() {
    this.cart = (typeof SVKCart !== 'undefined') ? SVKCart.getCart() : this._readCart();
    if (!this.cart.length) {
      window.location.href = 'cart.html';
      return;
    }
    this.subtotal = this.cart.reduce((s, i) => s + i.price * i.quantity, 0);

    if (typeof gtag === 'function') {
      gtag('event', 'begin_checkout', {
        currency: 'USD',
        value: this.subtotal,
        items: this.cart.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
      });
    }

    this._renderSummary();
    this._renderShippingPlaceholder('Enter your shipping address above to see shipping options.');
    this._bindAddressFieldsForShipping();
    this._bindTabs();
    this._bindCoupon();
    this._bindContinueBtn();
    this._bindFieldErrorClearing();
    this._bindDraftPersistence();
    await this._prefillAuth();
    this._restoreDraft(); // may kick off an immediate shipping rate fetch
    this._updateTotals();
    this._setStep('details');

    // Resume an interrupted Stripe payment (e.g. the browser was refreshed mid-checkout)
    // instead of creating a duplicate pending order.
    const resume = this._getStripeResume();
    if (resume && resume.stripeClientSecret) {
      this.supabaseOrderId = resume.supabaseOrderId;
      this.orderNumber = resume.orderNumber;
      this.stripeClientSecret = resume.stripeClientSecret;
      document.querySelector('[data-tab="card"]')?.click();
      await this._mountStripeElements(resume.stripeClientSecret, resume.customerName, resume.customerEmail);
      return;
    }

    this._autofocusFirstField();
  },

  _readCart() {
    try { return JSON.parse(localStorage.getItem('svk_cart')) || []; }
    catch { return []; }
  },

  _cartSignature() {
    return this.cart.map(i => `${i.id}:${i.quantity}`).sort().join('|');
  },

  _renderSummary() {
    const el = document.getElementById('checkout-items');
    if (!el) return;
    el.innerHTML = this.cart.map(item => {
      const opts = Object.entries(item.options || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
      return `<div class="checkout-item">
        <div class="checkout-item-img-wrap">
          <img src="${item.image}" alt="${item.name}" class="checkout-item-img" loading="lazy">
          <span class="checkout-item-qty">${item.quantity}</span>
        </div>
        <div class="checkout-item-info">
          <div class="checkout-item-name">${item.name}</div>
          ${opts ? `<div class="checkout-item-opts">${opts}</div>` : ''}
        </div>
        <div class="checkout-item-price">$${(item.price * item.quantity).toLocaleString()}</div>
      </div>`;
    }).join('');
  },

  // ---- Live shipping rates ----

  _addressComplete() {
    const a = this._getShippingAddress();
    return !!(a.address && a.city && a.state && /^\d{5}$/.test(a.zip));
  },

  _bindAddressFieldsForShipping() {
    ['ship-address', 'ship-city', 'ship-zip'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this._scheduleShippingFetch());
    });
    document.getElementById('ship-state')?.addEventListener('change', () => {
      this._updateTotals(); // tax depends on state — reflect instantly, rates refresh below
      this._scheduleShippingFetch();
    });
  },

  _scheduleShippingFetch() {
    clearTimeout(this._shippingDebounceTimer);
    if (!this._addressComplete()) {
      this._renderShippingPlaceholder('Enter your shipping address above to see shipping options.');
      return;
    }
    this._shippingDebounceTimer = setTimeout(() => this._fetchShippingRates(), 500);
  },

  async _fetchShippingRates() {
    if (!this._addressComplete()) return;
    const address = this._getShippingAddress();
    const previousId = this.shippingOptionId;
    const previousLabel = this._getShippingOption()?.label || this._pendingShippingLabel;
    const token = ++this._shippingFetchToken;

    this._renderShippingPlaceholder('Calculating shipping options…');

    let rates = null;
    try {
      const res = await fetch('/.netlify/functions/get-shipping-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItems: this.cart, shippingAddress: address }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.rates) && data.rates.length) {
        rates = data.rates;
        this.shippingRateSource = data.source;
      }
    } catch (err) {
      console.error('Shipping rate fetch failed:', err);
    }

    if (token !== this._shippingFetchToken) return; // a newer request already superseded this one

    if (!rates || !rates.length) {
      rates = this.FLAT_RATE_FALLBACK;
      this.shippingRateSource = 'flat';
    }

    this.shippingOptions = [...rates, this.INTERNATIONAL_OPTION];
    this._pendingShippingLabel = null;

    // Keep the user's previous selection across a re-fetch (draft restore, or
    // editing the address after already picking a method) when possible.
    let reselectId = null;
    if (previousId && this.shippingOptions.some(o => o.id === previousId)) {
      reselectId = previousId;
    } else if (previousLabel) {
      const match = this.shippingOptions.find(o => o.label === previousLabel);
      if (match) reselectId = match.id;
    }
    this._renderShippingOptions(reselectId);
  },

  _renderShippingPlaceholder(text) {
    const el = document.getElementById('shipping-options');
    if (el) el.innerHTML = `<div class="ship-placeholder">${text}</div>`;
    this.shippingOptionId = null;
    const notice = document.getElementById('intl-shipping-notice');
    if (notice) notice.style.display = 'none';
    this._updateTotals();
  },

  _renderShippingOptions(preselectId) {
    const el = document.getElementById('shipping-options');
    if (!el || !this.shippingOptions.length) return;

    const selected = preselectId && this.shippingOptions.some(o => o.id === preselectId)
      ? preselectId
      : this.shippingOptions[0].id;

    el.innerHTML = this.shippingOptions.map(opt => `
      <label class="ship-option${opt.international ? ' ship-option-intl' : ''}" data-ship-id="${opt.id}">
        <input type="radio" name="shipping-method" value="${opt.id}" ${opt.id === selected ? 'checked' : ''}>
        <span class="ship-option-label">
          <span class="ship-option-name">${opt.label}</span>
          <span class="ship-option-desc">${opt.desc}</span>
        </span>
        ${opt.price === null
          ? '<span class="ship-option-price-note">Contact for Quote</span>'
          : `<span class="ship-option-price">$${opt.price.toFixed(2)}</span>`}
      </label>
    `).join('');

    this.shippingOptionId = selected;
    el.querySelector(`.ship-option[data-ship-id="${CSS.escape(selected)}"]`)?.classList.add('selected');

    el.querySelectorAll('.ship-option').forEach(label => {
      label.addEventListener('click', () => {
        el.querySelectorAll('.ship-option').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        label.querySelector('input[type="radio"]').checked = true;
        this.shippingOptionId = label.dataset.shipId;
        this._applyShippingSelectionUI();
        this._updateTotals();
        this._saveDraft();
      });
    });

    this._applyShippingSelectionUI();
    this._updateTotals();
    this._updateIntlEmailLink();
    this._saveDraft();
  },

  // Toggles the "email us for a quote" notice and locks out payment while
  // International Shipping is selected — there's no real total to charge yet.
  _applyShippingSelectionUI() {
    const shipOpt = this._getShippingOption();
    const isIntl = !!(shipOpt && shipOpt.international);
    const notice = document.getElementById('intl-shipping-notice');
    const continueBtn = document.getElementById('continue-btn');
    if (notice) notice.style.display = isIntl ? 'block' : 'none';
    if (continueBtn) continueBtn.disabled = isIntl;
    if (isIntl) this._updateIntlEmailLink();
  },

  _updateIntlEmailLink() {
    const btn = document.getElementById('intl-email-btn');
    if (!btn) return;
    const itemLines = this.cart.map(i => `- ${i.name} x${i.quantity}`).join('\n');
    const subject = encodeURIComponent('International Shipping Quote Request');
    const body = encodeURIComponent(
      `Hi SVK Works,\n\nI'd like a shipping quote for international delivery.\n\nMy cart:\n${itemLines}\n\n` +
      `My shipping address:\n[Please fill in your full international address here]\n\nThanks!`
    );
    btn.href = `mailto:info@svkworks.com?subject=${subject}&body=${body}`;
  },

  _bindCoupon() {
    const btn = document.getElementById('checkout-apply-coupon-btn');
    const input = document.getElementById('checkout-coupon-input');
    if (!btn || !input) return;

    const apply = async () => {
      const code = (input.value || '').trim();
      const msg = document.getElementById('checkout-coupon-msg');
      if (!msg) return;

      const show = (text, ok) => {
        msg.style.display = 'block';
        msg.style.color = ok ? '#34d399' : '#f87171';
        msg.textContent = text;
      };

      if (!code) {
        this._clearDiscount();
        show('Please enter a discount code.', false);
        return;
      }

      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Checking…';
      try {
        const res = await fetch('/.netlify/functions/validate-discount', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, cartItems: SVKCart.getCart() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not check that code.');

        if (!data.ok) {
          this._clearDiscount();
          show(data.error, false);
          return;
        }

        // The server is the authority on the amount — the value stored here is
        // only for display. Both payment functions re-resolve the code
        // independently, so editing this in the console changes nothing.
        this.discountCode = data.code;
        this.discount = data.discount;
        this.discountLabel = data.label;
        this._updateTotals();
        this._saveDraft();
        show(`${data.label} applied.`, true);
      } catch (err) {
        this._clearDiscount();
        show(err.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    };

    btn.addEventListener('click', apply);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
    });
  },

  _clearDiscount() {
    this.discountCode = null;
    this.discount = 0;
    this.discountLabel = null;
    this._updateTotals();
  },

  _getShippingOption() {
    return (this.shippingOptions || []).find(o => o.id === this.shippingOptionId);
  },

  _updateTotals() {
    const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const subEl = document.getElementById('sum-subtotal');
    const shipEl = document.getElementById('sum-shipping');
    const taxEl = document.getElementById('sum-tax');
    const totalEl = document.getElementById('checkout-total');
    if (subEl) subEl.textContent = fmt(this.subtotal);

    const shipOpt = this._getShippingOption();

    // International shipping has no known cost until we quote it by email —
    // don't compute a fake total.
    if (shipOpt && shipOpt.international) {
      if (shipEl) shipEl.textContent = 'Contact for quote';
      if (taxEl) taxEl.textContent = '—';
      if (totalEl) totalEl.textContent = '—';
      return { shipping: null, tax: null, grandTotal: null };
    }

    const shipping = shipOpt ? shipOpt.price : 0;
    const state = (document.getElementById('ship-state')?.value || '').trim().toUpperCase();

    // Mirrors calculateTotals() in netlify/functions/_pricing.js: the discount
    // comes off the goods before tax, is clamped to the subtotal, and never
    // touches shipping. This is display only — the server re-derives all of it.
    const discount = Math.min(Math.max(this.discount || 0, 0), this.subtotal);
    const taxBase = this.subtotal - discount + shipping;
    const tax = state === 'TX' ? Math.round(taxBase * this.TX_TAX_RATE * 100) / 100 : 0;
    const grandTotal = Math.round((taxBase + tax) * 100) / 100;

    const discRow = document.getElementById('sum-discount-row');
    const discEl = document.getElementById('sum-discount');
    const discLabel = document.getElementById('sum-discount-label');
    if (discRow) discRow.style.display = discount > 0 ? '' : 'none';
    if (discEl) discEl.textContent = '-' + fmt(discount);
    if (discLabel) discLabel.textContent = this.discountLabel ? `Discount (${this.discountCode})` : 'Discount';

    if (shipEl) shipEl.textContent = shipOpt ? fmt(shipping) : 'Select method';
    if (taxEl) taxEl.textContent = fmt(tax);
    if (totalEl) totalEl.textContent = fmt(grandTotal);

    return { shipping, tax, grandTotal, discount };
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
        this._saveDraft();
      });
    });
  },

  // ---- Progress stepper ----

  _setStep(step) {
    document.querySelectorAll('.checkout-stepper .step').forEach(el => {
      const s = el.dataset.step;
      el.classList.toggle('active', s === step);
      el.classList.toggle('done', step === 'payment' && s === 'details');
    });
  },

  // ---- Inline field validation ----

  _setFieldError(id, msg) {
    const input = document.getElementById(id);
    const err = document.getElementById('err-' + id);
    if (input) input.classList.add('field-invalid');
    if (err) err.textContent = msg;
  },

  _clearFieldError(id) {
    const input = document.getElementById(id);
    const err = document.getElementById('err-' + id);
    if (input) input.classList.remove('field-invalid');
    if (err) err.textContent = '';
  },

  _clearAllFieldErrors() {
    this.FIELD_IDS.forEach(id => this._clearFieldError(id));
  },

  _bindFieldErrorClearing() {
    this.FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => this._clearFieldError(id));
    });
  },

  _autofocusFirstField() {
    const nameEl = document.getElementById('customer-name');
    if (nameEl && !nameEl.value) nameEl.focus();
  },

  // ---- Form draft persistence (survives an accidental refresh) ----

  _bindDraftPersistence() {
    ['customer-name', 'customer-email', 'customer-notes', 'ship-address', 'ship-city', 'ship-zip'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this._saveDraft());
    });
    document.getElementById('ship-state')?.addEventListener('change', () => this._saveDraft());
  },

  _saveDraft() {
    try {
      sessionStorage.setItem(this.DRAFT_KEY, JSON.stringify({
        cartSig: this._cartSignature(),
        name: document.getElementById('customer-name')?.value || '',
        email: document.getElementById('customer-email')?.value || '',
        notes: document.getElementById('customer-notes')?.value || '',
        address: document.getElementById('ship-address')?.value || '',
        city: document.getElementById('ship-city')?.value || '',
        state: document.getElementById('ship-state')?.value || '',
        zip: document.getElementById('ship-zip')?.value || '',
        shippingOptionId: this.shippingOptionId,
        shippingLabel: this._getShippingOption()?.label || null,
        paymentMethod: this.paymentMethod,
      }));
    } catch { /* sessionStorage unavailable — draft persistence is a nice-to-have, not required */ }
  },

  _restoreDraft() {
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(this.DRAFT_KEY) || 'null'); } catch { draft = null; }
    if (!draft || draft.cartSig !== this._cartSignature()) return;

    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('customer-name', draft.name);
    set('customer-email', draft.email);
    set('customer-notes', draft.notes);
    set('ship-address', draft.address);
    set('ship-city', draft.city);
    set('ship-state', draft.state);
    set('ship-zip', draft.zip);

    if (draft.shippingOptionId) this.shippingOptionId = draft.shippingOptionId;
    this._pendingShippingLabel = draft.shippingLabel || null;

    if (draft.paymentMethod && draft.paymentMethod !== this.paymentMethod) {
      document.querySelector(`[data-tab="${draft.paymentMethod}"]`)?.click();
    }

    if (this._addressComplete()) this._fetchShippingRates();
  },

  // ---- Stripe payment resume (survives a refresh mid-payment) ----

  _saveStripeResume(data) {
    try {
      sessionStorage.setItem(this.STRIPE_RESUME_KEY, JSON.stringify({ cartSig: this._cartSignature(), ...data }));
    } catch { /* non-critical */ }
  },

  _clearStripeResume() {
    sessionStorage.removeItem(this.STRIPE_RESUME_KEY);
  },

  _getStripeResume() {
    let resume;
    try { resume = JSON.parse(sessionStorage.getItem(this.STRIPE_RESUME_KEY) || 'null'); } catch { resume = null; }
    if (!resume || resume.cartSig !== this._cartSignature()) return null;
    return resume;
  },

  _bindContinueBtn() {
    document.getElementById('continue-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('customer-name').value.trim();
      const email = document.getElementById('customer-email').value.trim();
      const notes = document.getElementById('customer-notes').value.trim();
      const shippingAddress = this._getShippingAddress();

      this._clearAllFieldErrors();
      let firstInvalidId = null;
      const invalidate = (id, msg) => {
        this._setFieldError(id, msg);
        if (!firstInvalidId) firstInvalidId = id;
      };

      if (!name) invalidate('customer-name', 'Enter your full name.');
      if (!email) invalidate('customer-email', 'Enter your email address.');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidate('customer-email', 'Enter a valid email address.');
      if (!shippingAddress.address) invalidate('ship-address', 'Enter your street address.');
      if (!shippingAddress.city) invalidate('ship-city', 'Enter your city.');
      if (!shippingAddress.state) invalidate('ship-state', 'Select a state.');
      if (!/^\d{5}$/.test(shippingAddress.zip)) invalidate('ship-zip', 'Enter a 5-digit ZIP code.');

      if (firstInvalidId) {
        const el = document.getElementById(firstInvalidId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
        return;
      }
      if (!this.shippingOptionId) {
        this._setError('Still calculating shipping options — please wait a moment and click Continue again.');
        this._fetchShippingRates();
        return;
      }
      const shipOpt = this._getShippingOption();
      if (shipOpt && shipOpt.international) {
        this._setError('International orders are quoted by email — please use the "Email Us for a Quote" button above before checking out.');
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
    this.userAccessToken = session.access_token;
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
          accessToken: this.userAccessToken,
          discountCode: this.discountCode,
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
      this._setStep('payment');

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
            sessionStorage.removeItem(this.DRAFT_KEY);
            this._clearStripeResume();
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
          accessToken: this.userAccessToken,
          discountCode: this.discountCode,
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

      this._saveStripeResume({
        supabaseOrderId: data.supabaseOrderId,
        orderNumber: data.orderNumber,
        stripeClientSecret: data.clientSecret,
        customerName: name,
        customerEmail: email,
      });

      await this._mountStripeElements(data.clientSecret, name, email);
    } catch (err) {
      this._setError(err.message);
    }
  },

  async _mountStripeElements(clientSecret, name, email) {
    document.getElementById('customer-form-section').style.display = 'none';
    document.getElementById('payment-section').style.display = 'block';
    document.getElementById('payment-heading').textContent = 'Enter Card Details';
    document.getElementById('stripe-container').style.display = 'block';
    this._setStep('payment');

    await this._loadScript('https://js.stripe.com/v3/', 'stripe-sdk');

    this.stripeInstance = window.Stripe(window.STRIPE_PUBLISHABLE_KEY);
    const elements = this.stripeInstance.elements({ clientSecret, appearance: {
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
      // If we get here, confirmPayment threw an error (success triggers the redirect,
      // which is also where the draft/resume sessionStorage keys get cleared).
      this._setPaymentLoading(false);
      if (error) this._setPaymentError(error.message);
    });
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
