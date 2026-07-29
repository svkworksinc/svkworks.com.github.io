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
  'svk-tshirt': 25,
};

// Estimated shipped weight per item, in ounces (box + item). Used only for
// live carrier rate lookups (Shippo) — adjust these as real package weights
// become known. Unlisted product ids fall back to DEFAULT_ITEM_WEIGHT_OZ.
const PRODUCT_WEIGHTS_OZ = {
  'mk4-2jzgte-standalone': 48,
  'mk4-2jzge-standalone': 48,
  'mk4-1jzgte-standalone': 48,
  'mk3-2jzgte-standalone': 48,
  'mk3-1jzgte-standalone': 48,
  'mk3-7mgte-standalone': 48,
  '2jz-vvti-connector': 8,
  'mk4-2jz-ac-connector': 8,
  'mk4-2jz-oil-pressure-connector': 6,
  'mk4-chassis-fusebox-connector-3pin': 6,
  'mk4-chassis-fusebox-connector-8pin': 8,
  'mk4-jza80-chassis-16pin': 10,
  'mk4-jza80-chassis-20pin': 10,
  'mk4-jza80-chassis-38pin': 12,
  'mk4-jza80-chassis-set-16-20-38pin': 24,
  'mk4-starter-connector': 6,
  'deutsch-dt-connector-kit': 16,
  'milspec-autosport-connector': 16,
  'mk4-supra-cupholder': 12,
  'svk-tshirt': 8,
};
const DEFAULT_ITEM_WEIGHT_OZ = 16;
const PACKAGING_WEIGHT_OZ = 6; // box/padding buffer added on top of item weight
const PARCEL_DIMENSIONS_IN = { length: 14, width: 10, height: 5 }; // reasonable default box

// Flat-rate shipping — used as a fallback when Shippo isn't configured or
// its API call fails, so checkout never breaks entirely.
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

// Total estimated parcel weight for a validated cart, in ounces.
function totalWeightOz(items) {
  const itemsWeight = items.reduce((sum, item) => {
    const unitWeight = PRODUCT_WEIGHTS_OZ[item.id] ?? DEFAULT_ITEM_WEIGHT_OZ;
    return sum + unitWeight * item.quantity;
  }, 0);
  return itemsWeight + PACKAGING_WEIGHT_OZ;
}

// Resolves a shipping selection to an authoritative price + label.
// shippingOptionId is either:
//   - a flat-rate key from SHIPPING_OPTIONS (fallback path), or
//   - a Shippo rate object_id (live rate path) — re-verified against Shippo,
//     never trusting a client-supplied dollar amount.
async function resolveShipping(shippingOptionId) {
  if (shippingOptionId === 'international') {
    throw new Error('International orders require a manual shipping quote — please email info@svkworks.com before checking out.');
  }

  const flatOption = SHIPPING_OPTIONS[shippingOptionId];
  if (flatOption) {
    return { shipping: flatOption.price, shippingLabel: flatOption.label };
  }

  // Not a flat-rate key — treat it as a live Shippo rate id and verify it server-side.
  const { verifyRate } = require('./_shippo');
  let rate;
  try {
    rate = await verifyRate(shippingOptionId);
  } catch (err) {
    throw new Error(`Could not verify shipping rate: ${err.message}`);
  }
  if (!rate || rate.amount === undefined) {
    throw new Error('Invalid or expired shipping rate — please recalculate shipping and try again.');
  }
  const shipping = Math.round(parseFloat(rate.amount) * 100) / 100;
  const shippingLabel = [rate.provider, rate.servicelevel?.name].filter(Boolean).join(' ');
  return { shipping, shippingLabel };
}

// Calculates tax and grand total for an already-resolved shipping cost.
function calculateTotals(subtotal, shipping, state) {
  const taxBase = subtotal + shipping;
  const tax = (state === 'TX') ? Math.round(taxBase * TX_TAX_RATE * 100) / 100 : 0;
  const grandTotal = Math.round((subtotal + shipping + tax) * 100) / 100;
  return { tax, grandTotal };
}

module.exports = {
  validateCart,
  resolveShipping,
  calculateTotals,
  totalWeightOz,
  SHIPPING_OPTIONS,
  PRODUCT_PRICES,
  PARCEL_DIMENSIONS_IN,
  TX_TAX_RATE,
};
