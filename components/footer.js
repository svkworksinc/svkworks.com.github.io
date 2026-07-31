/* ============================================
   SVK Works — Footer Component
   Edit this file to update the footer on all pages.
   ============================================ */

const SVK_FOOTER_HTML = `
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col footer-about">
        <a href="/" class="footer-logo">
          <picture><source srcset="/img/svk-logo.webp" type="image/webp"><img src="/img/svk-logo.png" alt="SVK Works" class="logo-img" width="400" height="139" loading="lazy"></picture>
        </a>
        <p>Custom standalone wiring harnesses built to order. Specializing in JDM platforms — 2JZ, 1JZ, 1UZ and beyond.</p>
        <form class="footer-subscribe" id="footer-subscribe-form" novalidate>
          <label class="footer-subscribe-label" for="footer-subscribe-email">Get new drops &amp; build guides</label>
          <div class="footer-subscribe-row">
            <input type="email" id="footer-subscribe-email" name="email" placeholder="you@email.com" autocomplete="email" required>
            <button type="submit" class="btn btn-primary btn-sm" id="footer-subscribe-btn">Sign Up</button>
          </div>
          <p class="footer-subscribe-msg" id="footer-subscribe-msg" role="status" aria-live="polite"></p>
        </form>
        <div class="footer-social">
          <a href="https://www.instagram.com/svk_works/" target="_blank" rel="noopener" aria-label="Instagram" class="social-link social-link--instagram">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </a>
          <a href="https://www.facebook.com/profile.php?id=61580949891529" target="_blank" rel="noopener" aria-label="Facebook" class="social-link social-link--facebook">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </a>
          <a href="mailto:info@svkworks.com" aria-label="Email" class="social-link social-link--email">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </a>
        </div>
      </div>
      <div class="footer-col">
        <h4>Products</h4>
        <ul>
          <li><a href="/harnesses.html">All Harnesses</a></li>
          <li><a href="/mk4-supra.html">MK4 Supra</a></li>
          <li><a href="/mk3-supra.html">MK3 Supra</a></li>
          <li><a href="/sc300.html">SC300 / SC400 / Soarer</a></li>
          <li><a href="/connectors.html">Connectors</a></li>
          <li><a href="/merchandise.html">Merchandise</a></li>
          <li><a href="/used-parts.html">Used Parts</a></li>
          <li><a href="/other-parts.html">Other Parts</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Resources</h4>
        <ul>
          <li><a href="/resources.html">Wiring Diagrams</a></li>
          <li><a href="/blog.html">Blog</a></li>
          <li><a href="/builds.html">Builds Gallery</a></li>
          <li><a href="/faq.html">FAQ</a></li>
          <li><a href="/track-order.html">Track Your Order</a></li>
          <li><a href="/support.html">Support</a></li>
          <li><a href="/contact.html">Contact Us</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about.html">About SVK</a></li>
          <li><a href="/terms.html">Terms &amp; Conditions</a></li>
          <li><a href="/terms.html#privacy">Privacy Policy</a></li>
          <li><a href="/terms.html#returns">Return Policy</a></li>
          <li><a href="/terms.html#shipping">Shipping Info</a></li>
        </ul>
      </div>
    </div>
  </div>
</footer>
<div class="footer-bottom-bar">
  <div class="container">
    <p class="footer-copyright">&copy; <span id="footer-year">2026</span> SVK Works. All rights reserved.</p>
    <p class="footer-tagline">Precision Wiring. Built by Enthusiasts.</p>
  </div>
</div>
`;
