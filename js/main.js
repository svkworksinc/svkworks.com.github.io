/* ============================================
   SVK Works — Main Application Controller
   ============================================ */

const SVKMain = {
  async init() {
    // Every step below is independent, so none of them may take the others
    // down. This used to be a straight sequence, and because ~23 pages load
    // main.js without products.js, `SVKProducts.load()` threw a ReferenceError
    // on those pages and aborted init() before observeAnimations() ran — which
    // left every .fade-in element stuck at opacity:0, i.e. permanently
    // invisible content on the blog posts and FAQ. Each step is isolated so a
    // single failure degrades one feature instead of blanking the page.
    const step = (name, fn) => {
      try {
        return fn();
      } catch (err) {
        console.error(`[SVKMain] ${name} failed:`, err);
      }
    };

    step('components', () => SVKComponents.load());

    // Product data is optional — only pages that include js/products.js have it.
    if (typeof SVKProducts !== 'undefined') {
      try {
        await SVKProducts.load();
      } catch (err) {
        console.error('[SVKMain] product data failed to load:', err);
      }
    }

    step('animations', () => this.observeAnimations());
    step('accordions', () => this.initAccordions());
    step('smoothScroll', () => this.initSmoothScroll());
    step('productGallery', () => this.initProductGallery());
  },

  observeAnimations() {
    const elements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .stagger-children, .line-reveal');
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

    elements.forEach(el => observer.observe(el));
  },

  initAccordions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.setAttribute('aria-expanded', 'false');
      header.addEventListener('click', () => {
        const item = header.parentElement;
        const body = item.querySelector('.accordion-body');
        const isActive = item.classList.contains('active');

        // Close all in same group
        const parent = item.parentElement;
        parent.querySelectorAll('.accordion-item').forEach(i => {
          i.classList.remove('active');
          const b = i.querySelector('.accordion-body');
          if (b) b.style.maxHeight = null;
          const h = i.querySelector('.accordion-header');
          if (h) h.setAttribute('aria-expanded', 'false');
        });

        // Toggle current
        if (!isActive) {
          item.classList.add('active');
          if (body) body.style.maxHeight = body.scrollHeight + 'px';
          header.setAttribute('aria-expanded', 'true');
        }
      });
    });
  },

  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;

      link.addEventListener('click', (e) => {
        let target;
        try {
          target = document.querySelector(href);
        } catch {
          return; // not a valid selector (e.g. href="#!") — let the browser handle it
        }
        if (!target) return;

        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Scrolling alone leaves keyboard focus behind on the link, so the next
        // Tab continues from the top of the page instead of from the target.
        // That silently defeats the skip-to-content link and every in-page
        // jump link. Move focus to the target, making it programmatically
        // focusable first if it isn't naturally (headings, <main>, <section>).
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1');
        }
        target.focus({ preventScroll: true });

        // Keep the URL in sync so the jump is shareable and the back button
        // works, without triggering a second browser-initiated jump.
        if (history.pushState) history.pushState(null, '', href);
      });
    });
  },

  initProductGallery() {
    document.querySelectorAll('.product-gallery-main').forEach(galleryMain => {
      const img = galleryMain.querySelector('img');
      if (!img) return;

      // Click to toggle zoom — ignore clicks on nav buttons so arrows don't also zoom
      galleryMain.addEventListener('click', (e) => {
        if (e.target.closest('.gallery-nav')) return;
        galleryMain.classList.toggle('zoomed');
        if (!galleryMain.classList.contains('zoomed')) {
          img.style.transformOrigin = '50% 50%';
        }
      });

      // Pan by moving the cursor while zoomed
      galleryMain.addEventListener('mousemove', (e) => {
        if (!galleryMain.classList.contains('zoomed')) return;
        const rect = galleryMain.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        img.style.transformOrigin = `${x}% ${y}%`;
      });

      galleryMain.addEventListener('mousedown', () => {
        if (galleryMain.classList.contains('zoomed')) galleryMain.classList.add('grabbing');
      });
      galleryMain.addEventListener('mouseup', () => galleryMain.classList.remove('grabbing'));
      galleryMain.addEventListener('mouseleave', () => {
        galleryMain.classList.remove('grabbing');
        if (galleryMain.classList.contains('zoomed')) img.style.transformOrigin = '50% 50%';
      });
    });

    // Thumbnail switching for static pages
    document.querySelectorAll('.product-thumb[data-src], .gallery-thumb[data-src]').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const galleryMain = thumb.closest('.product-gallery')?.querySelector('.product-gallery-main');
        const mainImg = galleryMain?.querySelector('img');
        if (mainImg) {
          mainImg.src = thumb.dataset.src;
          galleryMain.classList.remove('zoomed');
        }
        thumb.closest('.product-gallery-thumbs, .gallery-thumbs')
          ?.querySelectorAll('.product-thumb, .gallery-thumb')
          .forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  },

  // Helper: format date
  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => {
  SVKMain.init();
});
