/* ============================================
   SVK Works — Header Component
   Edit this file to update the header on all pages.
   ============================================ */

const SVK_HEADER_HTML = `
<a href="#main-content" class="skip-to-content">Skip to main content</a>
<header class="site-header" id="site-header">
  <div class="header-top">
    <div class="container">
      <div class="header-top-content">
        <span class="header-notice">Custom Standalone Wiring Harnesses — Built to Order
        || For Questions and Concerns please email at info@svkworks.com or contact us through Instagram / Facebook
</span>
        <div class="header-top-links">
          <a href="/support.html">Support</a>
          <a href="/resources.html">Resources</a>
          <a href="/terms.html">Terms &amp; Conditions</a>
        </div>
      </div>
    </div>
  </div>
  <nav class="header-main">
    <div class="container">
      <div class="nav-content">
        <a href="/" class="logo" aria-label="SVK Works Home">
          <img src="/img/svk-logo.png" alt="SVK Works" class="logo-img">
        </a>
        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
          <span class="hamburger"></span>
        </button>
        <ul class="nav-menu" id="nav-menu">
          <li class="nav-item has-dropdown">
            <a href="/harnesses.html" class="nav-link" aria-haspopup="true">Harnesses</a>
            <ul class="dropdown">
              <li><a href="/mk4-supra.html">MK4 Supra</a></li>
              <li><a href="/mk3-supra.html">MK3 Supra</a></li>
              <li><a href="/sc300.html">SC300 / SC400 / Soarer</a></li>
              <li><a href="/2jz-universal-harness.html">2JZ Universal Swap</a></li>
              <li><a href="/1uz-universal-harness.html">1UZ Universal Swap</a></li>
              <li><a href="/k-series-universal-harness.html">K-Series Universal Swap</a></li>
              <li><a href="/harnesses.html">View All</a></li>
            </ul>
          </li>
          <li class="nav-item has-dropdown">
            <a href="/services.html" class="nav-link" aria-haspopup="true">Services</a>
            <ul class="dropdown">
              <li><a href="/service-custom-harness.html">Custom Harness Design</a></li>
              <li><a href="/service-connector-assembly.html">Connector Assembly</a></li>
              <li><a href="/service-3d-printing.html">3D Part Design &amp; Printing</a></li>
              <li><a href="/service-wiring-repair.html">Wiring Troubleshooting &amp; Repair</a></li>
              <li><a href="/service-ecu-repair.html">ECU Repair</a></li>
              <li><a href="/milspec-connector.html">MILSpec Harness</a></li>
              <li><a href="/service-harness-conversion.html">Harness Conversion</a></li>
            </ul>
          </li>
          <li class="nav-item has-dropdown">
            <a href="/other-parts.html" class="nav-link" aria-haspopup="true">Parts</a>
            <ul class="dropdown">
              <li><a href="/3d-parts.html">3D Parts</a></li>
              <li><a href="/other-parts.html">Other Parts</a></li>
            </ul>
          </li>
          <li class="nav-item has-dropdown">
            <a href="/connectors.html" class="nav-link" aria-haspopup="true">Connectors</a>
            <ul class="dropdown">
              <li><a href="/connectors.html">MK4 Supra Connectors</a></li>
              <li><a href="/connectors.html#deutsch">Deutsch / Mil-Spec</a></li>
              <li><a href="/milspec-connector.html">Autosport Upgrade</a></li>
            </ul>
          </li>
          <li class="nav-item has-dropdown">
            <a href="/merchandise.html" class="nav-link" aria-haspopup="true">Merchandise</a>
            <ul class="dropdown">
              <li><a href="/merchandise.html">Shirts</a></li>
              <li><a href="/merchandise.html#stickers">Stickers</a></li>
              <li><a href="/merchandise.html#decals">Decals</a></li>
            </ul>
          </li>
          <li class="nav-item"><a href="/builds.html" class="nav-link">Builds</a></li>
          <li class="nav-item"><a href="/blog.html" class="nav-link">Blog</a></li>
          <li class="nav-item"><a href="/resources.html" class="nav-link">Resources</a></li>
          <li class="nav-item"><a href="/about.html" class="nav-link">About</a></li>
          <li class="nav-item"><a href="/contact.html" class="nav-link">Contact</a></li>
        </ul>
        <div class="nav-actions">
          <button class="nav-action-btn search-toggle" id="search-toggle" aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <a href="/login.html" class="nav-action-btn account-btn" id="account-btn" aria-label="My Account">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </a>
          <a href="/cart.html" class="nav-action-btn cart-btn" aria-label="Shopping Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <span class="cart-count" id="cart-count">0</span>
          </a>
        </div>
      </div>
    </div>
  </nav>
  <div class="search-overlay" id="search-overlay">
    <div class="container">
      <form class="search-form" action="/search.html" method="GET">
        <input type="text" name="q" class="search-input" id="search-input" placeholder="Search products, harnesses, resources..." autocomplete="off">
        <button type="submit" class="search-submit" aria-label="Search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button type="button" class="search-close" id="search-close" aria-label="Close search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </form>
    </div>
  </div>
</header>
`;
