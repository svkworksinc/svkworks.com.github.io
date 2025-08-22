function updateCartCount() {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  let count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cartCount").innerText = count;
}

// Run when page loads
document.addEventListener("DOMContentLoaded", updateCartCount);