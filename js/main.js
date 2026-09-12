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
    const isMobile = 'ontouchstart' in window;

    document.querySelectorAll('.product-gallery-main').forEach(galleryMain => {
      const img = galleryMain.querySelector('img');
      if (!img) return;

      if (!isMobile) {
        // Desktop: click to toggle zoom, mousemove to pan
        galleryMain.addEventListener('click', (e) => {
          if (e.target.closest('.gallery-nav')) return;
          galleryMain.classList.toggle('zoomed');
          if (!galleryMain.classList.contains('zoomed')) {
            img.style.transformOrigin = '50% 50%';
          }
        });

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
      } else {
        // Mobile: pinch-to-zoom + long-press magnifier bubble
        let scale = 1, tx = 0, ty = 0;
        let pinchStartDist = 0, pinchStartScale = 1;
        let panStartX = 0, panStartY = 0, panStartTx = 0, panStartTy = 0;
        let longPressTimer = null, longPressActive = false;
        let lastTap = 0, touchStartX = 0, touchStartY = 0;
        const MAG_SIZE = 150, MAG_ZOOM = 3, LONG_PRESS_MS = 400, MOVE_THRESH = 8;

        let magnifier = document.getElementById('svk-img-magnifier');
        if (!magnifier) {
          magnifier = document.createElement('div');
          magnifier.id = 'svk-img-magnifier';
          magnifier.className = 'img-magnifier';
          document.body.appendChild(magnifier);
        }

        function applyTransform(animated) {
          img.style.transition = animated ? 'transform 0.3s ease' : 'none';
          img.style.transform = scale === 1 ? '' : `translate(${tx}px,${ty}px) scale(${scale})`;
        }

        function showMagnifier(clientX, clientY) {
          const rect = galleryMain.getBoundingClientRect();
          const natW = img.naturalWidth || rect.width;
          const natH = img.naturalHeight || rect.height;
          const cAR = rect.width / rect.height, iAR = natW / natH;
          let rW, rH, rX, rY;
          if (iAR > cAR) { rW = rect.width; rH = rect.width / iAR; }
          else { rH = rect.height; rW = rect.height * iAR; }
          rX = (rect.width - rW) / 2;
          rY = (rect.height - rH) / 2;
          const px = clientX - rect.left - rX;
          const py = clientY - rect.top - rY;
          const half = MAG_SIZE / 2;
          magnifier.style.backgroundImage = `url('${img.src}')`;
          magnifier.style.backgroundSize = `${rW * MAG_ZOOM}px ${rH * MAG_ZOOM}px`;
          magnifier.style.backgroundPosition = `${half - px * MAG_ZOOM}px ${half - py * MAG_ZOOM}px`;
          magnifier.style.left = `${clientX - half}px`;
          magnifier.style.top = `${clientY - MAG_SIZE - 24}px`;
          magnifier.style.display = 'block';
        }

        galleryMain.addEventListener('touchstart', (e) => {
          if (e.target.closest('.gallery-nav')) return;
          if (e.touches.length === 2) {
            clearTimeout(longPressTimer);
            longPressActive = false;
            magnifier.style.display = 'none';
            pinchStartDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            pinchStartScale = scale;
            e.preventDefault();
          } else if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            panStartX = touchStartX;
            panStartY = touchStartY;
            panStartTx = tx;
            panStartTy = ty;
            longPressTimer = setTimeout(() => {
              longPressActive = true;
              showMagnifier(touchStartX, touchStartY);
            }, LONG_PRESS_MS);
          }
        }, { passive: false });

        galleryMain.addEventListener('touchmove', (e) => {
          if (e.target.closest('.gallery-nav')) return;
          if (e.touches.length === 2) {
            clearTimeout(longPressTimer);
            const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            scale = Math.min(4, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
            if (scale === 1) { tx = 0; ty = 0; }
            applyTransform(false);
            e.preventDefault();
          } else if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (Math.hypot(dx, dy) > MOVE_THRESH) clearTimeout(longPressTimer);
            if (longPressActive) {
              showMagnifier(e.touches[0].clientX, e.touches[0].clientY);
              e.preventDefault();
            } else if (scale > 1) {
              tx = panStartTx + (e.touches[0].clientX - panStartX);
              ty = panStartTy + (e.touches[0].clientY - panStartY);
              applyTransform(false);
              e.preventDefault();
            }
          }
        }, { passive: false });

        galleryMain.addEventListener('touchend', (e) => {
          clearTimeout(longPressTimer);
          if (longPressActive) {
            longPressActive = false;
            magnifier.style.display = 'none';
            return;
          }
          if (e.changedTouches.length === 1 && e.touches.length === 0) {
            const now = Date.now();
            if (now - lastTap < 300) {
              scale = 1; tx = 0; ty = 0;
              applyTransform(true);
            }
            lastTap = now;
          }
        }, { passive: true });
      }
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
