/* ============================================
   SVK Works — Wishlist (localStorage)
   ============================================ */

const SVKWishlist = {
  STORAGE_KEY: 'svk_wishlist',

  getWishlist() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  toggle(productId) {
    const list = this.getWishlist();
    const idx  = list.indexOf(productId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(productId);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    return idx < 0; // true = added, false = removed
  },

  has(productId) {
    return this.getWishlist().includes(productId);
  },

  count() {
    return this.getWishlist().length;
  },

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  },
};
