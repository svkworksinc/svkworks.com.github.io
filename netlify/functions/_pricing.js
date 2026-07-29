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

const SHIPPING_OPTIONS = {
  'usps-ground':    { label: 'USPS Ground Advantage', desc: '5–8 business days',  price: 12.95 },
  'usps-priority':  { label: 'USPS Priority Mail',    desc: '2–3 business days',  price: 19.95 },
  'ups-ground':     { label: 'UPS Ground',            desc: '3–5 business days',  price: 24.95 },
  'ups-2day':       { label: 'UPS 2-Day Air',         desc: '2 business days',    price: 65.00 },
  'ups-overnight':  { label: 'UPS Next Day Air',      desc: '1 business day',     price: 125.00 },
};

const TX_TAX_RATE = 0.0825; // Texas combined state (6.25%) + typical local (2%) rate

function validateCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty or invalid.');
  }
  let subtotal = 0;
  const validated = [];
  for (const item of items) {
    const price = PRODUCT_PRICES[item.id];
    if (price === undefined) {
      throw new Error(`Unknown product: ${item.id}`);
    }
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const lineTotal = price * quantity;
    subtotal += lineTotal;
    validated.push({ id: item.id, name: item.name, image: item.image, options: item.options || {}, price, quantity, lineTotal });
  }
  return { items: validated, subtotal };
}

// Validates shipping option and calculates shipping cost, applicable tax, and grand total.
// state should be a 2-letter US state code (e.g. 'TX').
function calculateTotals(subtotal, shippingOptionId, state) {
  const option = SHIPPING_OPTIONS[shippingOptionId];
  if (!option) throw new Error(`Invalid shipping option: ${shippingOptionId}`);
  const shipping = option.price;
  const taxBase = subtotal + shipping;
  const tax = (state === 'TX') ? Math.round(taxBase * TX_TAX_RATE * 100) / 100 : 0;
  const grandTotal = Math.round((subtotal + shipping + tax) * 100) / 100;
  return { shipping, shippingLabel: option.label, tax, grandTotal };
}

module.exports = { validateCart, calculateTotals, SHIPPING_OPTIONS, PRODUCT_PRICES, TX_TAX_RATE };
