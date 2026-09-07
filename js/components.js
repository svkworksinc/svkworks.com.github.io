/* ============================================
   SVK Works — Component Loader
   Injects header/footer from components/*.js
   and initializes interactive behavior.
   ============================================ */

const SVKComponents = {
  // ─── Google Analytics 4 ───────────────────────────────────────────────────
  // Replace G-XXXXXXXXXX with your GA4 Measurement ID from analytics.google.com
  // Go to: Admin → Data Streams → select your stream → copy the Measurement ID
  GA_ID: 'G-RPE47LV27L',

  // ─── Sentry error monitoring ───────────────────────────────────────────────
  // Paste your DSN from sentry.io → Settings → Projects → [project] → Client Keys (DSN)
  SENTRY_DSN: '',

  _loadAnalytics() {
    if (!this.GA_ID || this.GA_ID === 'G-XXXXXXXXXX') return; // not yet configured
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.GA_ID}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', this.GA_ID, { anonymize_ip: true });
  },

  _loadErrorMonitoring() {
    if (!this.SENTRY_DSN) return; // not yet configured
    const script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/8.9.2/bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      window.Sentry.init({ dsn: this.SENTRY_DSN, tracesSampleRate: 0 });
    };
    document.head.appendChild(script);
  },

  _initCookieConsent() {
    if (localStorage.getItem('svk-privacy-ok') === '1') return;
    const banner = document.createElement('div');
    banner.id = 'svk-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Privacy notice');
    banner.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:9999',
      'background:var(--bg-card)', 'border-top:2px solid var(--border-color)',
      'padding:14px 24px', 'display:flex', 'align-items:center',
      'gap:20px', 'justify-content:space-between',
      'font-size:0.875rem', 'color:var(--text-secondary)',
      'box-shadow:0 -4px 24px rgba(0,0,0,0.18)',
    ].join(';');
    banner.innerHTML = `
      <p style="margin:0;flex:1;min-width:0;">
        We use local storage to keep your cart and <a href="/privacy-policy.html" style="color:var(--magenta);">Google Analytics</a> (anonymized) to understand site traffic.
        <a href="/privacy-policy.html" style="color:var(--magenta);white-space:nowrap;">Privacy Policy</a>
      </p>
      <button id="svk-cookie-accept" style="flex-shrink:0;background:var(--magenta);color:#fff;border:none;padding:8px 22px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.875rem;">Got it</button>`;
    document.body.appendChild(banner);
    document.getElementById('svk-cookie-accept').addEventListener('click', () => {
      localStorage.setItem('svk-privacy-ok', '1');
      banner.style.display = 'none';
    });
  },

  load() {
    this._loadAnalytics();
    this._loadErrorMonitoring();
    const headerEl = document.getElementById('header-placeholder');
    const footerEl = document.getElementById('footer-placeholder');

    if (headerEl && typeof SVK_HEADER_HTML !== 'undefined') {
      headerEl.outerHTML = SVK_HEADER_HTML;
      this.initHeader();
    }

    if (footerEl && typeof SVK_FOOTER_HTML !== 'undefined') {
      footerEl.outerHTML = SVK_FOOTER_HTML;
      this.initFooter();
    }

    SVKCart.updateCartCount();
    this._bootstrapAuth();
    this._initCookieConsent();
  },

  _bootstrapAuth() {
    // Pages that require auth up front (login.html, account.html, admin pages)
    // load the SDK + auth.js themselves and call SVKAuth.init() explicitly —
    // don't load it a second time (redeclaring SVKAuth would throw).
    if (typeof SVKAuth !== 'undefined') {
      SVKAuth.ready.then(() => this._updateAccountBtn());
      return;
    }

    // Skip loading the Supabase SDK (~300 KB) when no session exists in storage.
    // Supabase persists sessions under keys matching "sb-*-auth-token".
    // Non-logged-in visitors (the vast majority) skip this entirely.
    const hasSession = Object.keys(localStorage).some(
      k => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!hasSession) return;

    const sdkScript = document.createElement('script');
    sdkScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    sdkScript.onload = () => {
      const authScript = document.createElement('script');
      authScript.src = 'js/auth.js?v=f9a5c12a';
      authScript.onload = () => {
        SVKAuth.init();
        SVKAuth.ready.then(() => this._updateAccountBtn());
      };
      document.head.appendChild(authScript);
    };
    document.head.appendChild(sdkScript);
  },

  async _updateAccountBtn() {
    if (!SVKAuth.configured) return;
    const session = await SVKAuth.getSession();
    if (!session) return;

    const btn = document.getElementById('account-btn');
    if (btn) {
      btn.href = 'account.html';
      btn.setAttribute('aria-label', 'My Account');
      btn.classList.add('logged-in');
    }

    const isAdmin = await SVKAuth.isAdmin();
    if (isAdmin) {
      const adminLink = document.getElementById('admin-top-link');
      if (adminLink) adminLink.style.display = '';
    }
  },

  initHeader() {
    const toggle = document.getElementById('nav-toggle');
    const menu = document.getElementById('nav-menu');
    const searchToggle = document.getElementById('search-toggle');
    const searchOverlay = document.getElementById('search-overlay');
    const searchClose = document.getElementById('search-close');
    const searchInput = document.getElementById('search-input');
    const header = document.getElementById('site-header');

    // Mobile menu helpers
    const closeMenu = () => {
      menu.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    // Mobile menu toggle
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
        menu.classList.toggle('active');
        document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
      });
    }

    // Mobile dropdown toggles + keyboard support
    document.querySelectorAll('.has-dropdown > .nav-link').forEach(link => {
      // Click: toggle on mobile, allow navigation on desktop
      link.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          link.parentElement.classList.toggle('open');
        }
      });
      // Keyboard: Enter/Space opens dropdown on any screen size
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          link.parentElement.classList.toggle('open');
          // Focus first item in dropdown when opening
          if (link.parentElement.classList.contains('open')) {
            const firstItem = link.parentElement.querySelector('.dropdown a');
            if (firstItem) firstItem.focus();
          }
        }
        // Arrow down also opens and focuses first item
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          link.parentElement.classList.add('open');
          const firstItem = link.parentElement.querySelector('.dropdown a');
          if (firstItem) firstItem.focus();
        }
      });
    });

    // Close open dropdowns when focus leaves them
    document.querySelectorAll('.has-dropdown').forEach(item => {
      item.addEventListener('focusout', (e) => {
        if (!item.contains(e.relatedTarget)) {
          item.classList.remove('open');
        }
      });
    });

    // Auto-close mobile menu when a non-dropdown link is tapped
    document.querySelectorAll('.nav-menu a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          // Only close if this is a real navigation link (not a dropdown toggle)
          const isDropdownToggle = link.classList.contains('nav-link') &&
                                   link.closest('.has-dropdown');
          if (!isDropdownToggle) {
            closeMenu();
          }
        }
      });
    });

    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu && menu.classList.contains('active')) {
        closeMenu();
      }
    });

    // Search overlay
    if (searchToggle && searchOverlay) {
      searchToggle.addEventListener('click', () => {
        searchOverlay.classList.add('active');
        if (searchInput) searchInput.focus();
      });
    }

    if (searchClose && searchOverlay) {
      searchClose.addEventListener('click', () => {
        searchOverlay.classList.remove('active');
      });
    }

    // Close search on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOverlay) {
        searchOverlay.classList.remove('active');
      }
    });

    // Header scroll behavior
    if (header) {
      let lastScroll = 0;
      window.addEventListener('scroll', () => {
        const current = window.scrollY;
        if (current > 50) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
        lastScroll = current;
      }, { passive: true });
    }

    // Set active nav link
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      }
    });
  },

  initFooter() {
    const yearEl = document.getElementById('footer-year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
    this.initSubscribe();
  },

  initSubscribe() {
    const form = document.getElementById('footer-subscribe-form');
    if (!form) return;
    const input = document.getElementById('footer-subscribe-email');
    const btn = document.getElementById('footer-subscribe-btn');
    const msg = document.getElementById('footer-subscribe-msg');

    const show = (text, ok) => {
      msg.textContent = text;
      msg.classList.toggle('is-error', !ok);
      msg.classList.add('is-visible');
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (input.value || '').trim();
      if (!email) {
        show('Please enter your email address.', false);
        input.focus();
        return;
      }

      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Signing up…';
      try {
        const res = await fetch('/.netlify/functions/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: location.pathname }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not sign you up right now.');
        form.reset();
        show('Thanks — you\'re on the list.', true);
      } catch (err) {
        show(err.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }
};
