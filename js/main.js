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
        });

        // Toggle current
        if (!isActive) {
          item.classList.add('active');
          if (body) body.style.maxHeight = body.scrollHeight + 'px';
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
