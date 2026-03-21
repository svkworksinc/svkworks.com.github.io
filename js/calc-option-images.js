/**
 * calc-option-images.js
 * Renders small image thumbnails for each calculator option.
 * Clicking or hovering a thumbnail shows it at 4× size via a popup.
 * Clicking a thumbnail also selects that option in the <select>.
 *
 * Usage: add data-img="path/to/image.jpg" to each <option> element.
 * Options without data-img are silently skipped.
 */

(function () {
  'use strict';

  // ── Floating popup (shared singleton) ──────────────────────────────────────
  const popup = document.createElement('div');
  popup.className = 'option-img-popup';
  popup.innerHTML = `
    <img src="" alt="">
    <div class="option-img-popup-label"></div>
    <span class="option-img-popup-close" title="Close">✕</span>
  `;
  document.body.appendChild(popup);

  const popupImg    = popup.querySelector('img');
  const popupLabel  = popup.querySelector('.option-img-popup-label');
  const popupClose  = popup.querySelector('.option-img-popup-close');

  let pinnedThumb = null;   // currently pinned thumb (click-locked)
  let hoverThumb  = null;   // thumb currently being hovered

  // Position the popup relative to the thumbnail, keeping it on screen
  function positionPopup(thumbEl) {
    const rect = thumbEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = popup.offsetWidth  || 256;
    const ph = popup.offsetHeight || 256;

    // Try to appear above the thumb, centred horizontally
    let top  = rect.top - ph - 12;
    let left = rect.left + rect.width / 2 - pw / 2;

    // Flip below if not enough room above
    if (top < 8) top = rect.bottom + 12;

    // Clamp horizontally
    left = Math.max(8, Math.min(left, vw - pw - 8));
    // Clamp vertically
    top  = Math.max(8, Math.min(top,  vh - ph - 8));

    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  }

  function showPopup(thumbEl) {
    const img   = thumbEl.querySelector('img');
    const label = thumbEl.dataset.label || '';
    if (!img) return;
    popupImg.src         = img.src;
    popupImg.alt         = img.alt;
    popupLabel.textContent = label;
    positionPopup(thumbEl);
    popup.classList.add('visible');
  }

  function hidePopup() {
    if (!pinnedThumb) {
      popup.classList.remove('visible');
    }
  }

  function pinPopup(thumbEl) {
    if (pinnedThumb === thumbEl) {
      // Toggle off
      pinnedThumb = null;
      popup.classList.remove('pinned');
      if (!hoverThumb) popup.classList.remove('visible');
      return;
    }
    pinnedThumb = thumbEl;
    showPopup(thumbEl);
    popup.classList.add('pinned');
  }

  popupClose.addEventListener('click', () => {
    pinnedThumb = null;
    popup.classList.remove('pinned', 'visible');
  });

  // Close pinned popup when clicking outside
  document.addEventListener('click', (e) => {
    if (pinnedThumb && !popup.contains(e.target) && !e.target.closest('.option-thumb')) {
      pinnedThumb = null;
      popup.classList.remove('pinned');
      if (!hoverThumb) popup.classList.remove('visible');
    }
  });

  // ── Build thumbnail strips ─────────────────────────────────────────────────
  function buildThumbs(selectEl) {
    const options = Array.from(selectEl.options);
    const withImg = options.filter(o => o.dataset.img);
    if (withImg.length === 0) return;

    const strip = document.createElement('div');
    strip.className = 'option-thumbs';

    withImg.forEach((opt) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'option-thumb';
      wrapper.dataset.optionIndex = opt.index;
      wrapper.dataset.label       = opt.text.replace(/\s*\(\+\$[\d,]+\)/, '').trim();

      const img = document.createElement('img');
      img.src     = opt.dataset.img;
      img.alt     = wrapper.dataset.label;
      img.loading = 'lazy';
      img.width   = 64;
      img.height  = 64;
      // Hide thumb if image fails to load (no placeholder needed)
      img.onerror = () => { wrapper.style.display = 'none'; };

      const lbl = document.createElement('span');
      lbl.className = 'option-thumb-label';
      lbl.textContent = wrapper.dataset.label;

      wrapper.appendChild(img);
      wrapper.appendChild(lbl);
      strip.appendChild(wrapper);

      // Hover events
      wrapper.addEventListener('mouseenter', () => {
        hoverThumb = wrapper;
        if (!pinnedThumb) showPopup(wrapper);
      });
      wrapper.addEventListener('mouseleave', () => {
        hoverThumb = null;
        hidePopup();
      });

      // Click: select option + pin popup
      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        // Select the option in the <select>
        selectEl.selectedIndex = opt.index;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        // Update active state
        strip.querySelectorAll('.option-thumb').forEach(t => t.classList.remove('active'));
        wrapper.classList.add('active');
        // Pin the popup
        pinPopup(wrapper);
      });
    });

    // Insert after the select element
    selectEl.insertAdjacentElement('afterend', strip);

    // Sync active thumb when select changes externally
    selectEl.addEventListener('change', () => {
      const idx = selectEl.selectedIndex;
      strip.querySelectorAll('.option-thumb').forEach(t => {
        t.classList.toggle('active', parseInt(t.dataset.optionIndex) === idx);
      });
    });

    // Set initial active based on current select value
    const initialIdx = selectEl.selectedIndex;
    strip.querySelectorAll('.option-thumb').forEach(t => {
      if (parseInt(t.dataset.optionIndex) === initialIdx) t.classList.add('active');
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    document.querySelectorAll('.calc-select, .calc-select-img').forEach(buildThumbs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
