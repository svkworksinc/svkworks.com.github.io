// Server-side price lookup — mirrors data/products-data.js prices.
// Only purchasable products (price > 0) are listed here.
// Quote-only products (price: 0) must use the email quote flow.
const PRODUCT_PRICES = {
  'mk4-2jzgte-standalone': 1200,
  'mk4-2jzge-standalone': 1050,
  'mk4-1jzgte-standalone': 1100,
  'mk3-2jzgte-standalone': 1350,
  'mk3-1jzgte-standalone': 1100,
  'mk3-7mgte-standalone': 950,
  '2jz-vvti-connector': 22,
  'mk4-2jz-ac-connector': 18,
  'mk4-2jz-oil-pressure-connector': 18,
  'mk4-chassis-fusebox-connector-3pin': 20,
  'mk4-chassis-fusebox-connector-8pin': 28,
  'mk4-jza80-chassis-16pin': 38,
  'mk4-jza80-chassis-20pin': 42,
  'mk4-jza80-chassis-38pin': 55,
  'mk4-jza80-chassis-set-16-20-38pin': 115,
  'mk4-starter-connector': 20,
  'deutsch-dt-connector-kit': 95,
  'milspec-autosport-connector': 350,
  'mk4-supra-cupholder': 45,
};

function validateCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty or invalid.');
  }
  let total = 0;
  const validated = [];
  for (const item of items) {
    const price = PRODUCT_PRICES[item.id];
    if (price === undefined) {
      throw new Error(`Unknown product: ${item.id}`);
    }
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const lineTotal = price * quantity;
    total += lineTotal;
    validated.push({ id: item.id, name: item.name, image: item.image, options: item.options || {}, price, quantity, lineTotal });
  }
  return { items: validated, total };
}

module.exports = { validateCart, PRODUCT_PRICES };
