/* ============================================
   SVK Works — Component Loader
   Injects header/footer from components/*.js
   and initializes interactive behavior.
   ============================================ */

const SVKComponents = {
  load() {
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
  },

  _bootstrapAuth() {
    // Dynamically load Supabase SDK then auth.js, then update the header
    const sdkScript = document.createElement('script');
    sdkScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    sdkScript.onload = () => {
      const authScript = document.createElement('script');
      authScript.src = 'js/auth.js';
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
    const btn = document.getElementById('account-btn');
    if (!btn) return;
    if (session) {
      btn.href = 'account.html';
      btn.setAttribute('aria-label', 'My Account');
      btn.classList.add('logged-in');
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

    // Mobile menu toggle
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
        menu.classList.toggle('active');
        document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
      });
    }

    // Mobile dropdown toggles
    document.querySelectorAll('.has-dropdown > .nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          link.parentElement.classList.toggle('open');
        }
      });
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
  }
};
