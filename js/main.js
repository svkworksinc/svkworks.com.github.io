/* ============================================
   SVK Works — Main Application Controller
   ============================================ */

const SVKMain = {
  async init() {
    // Load components (header/footer) — synchronous, uses inline JS templates
    SVKComponents.load();

    // Load product data
    await SVKProducts.load();

    // Init scroll animations
    this.observeAnimations();

    // Init accordion if present
    this.initAccordions();

    // Smooth scroll for anchor links
    this.initSmoothScroll();

    // Gallery zoom+pan on any page with a product gallery
    this.initProductGallery();
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
      link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  },

  initProductGallery() {
    document.querySelectorAll('.product-gallery-main').forEach(galleryMain => {
      const img = galleryMain.querySelector('img');
      if (!img) return;

      // Click to toggle zoom
      galleryMain.addEventListener('click', () => {
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
