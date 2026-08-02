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

  // TEMPORARY — live-payment end-to-end test item. $0.50 is the lowest
  // amount Stripe will actually process; true $0 isn't chargeable. Ships
  // as a "digital" item (see DIGITAL_PRODUCT_IDS below) so it doesn't
  // carry a real shipping charge. Delete this line, its weight entry
  // below, and its DIGITAL_PRODUCT_IDS entry once live testing is done.
  'svk-live-payment-test': 0.50,
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
  'svk-live-payment-test': 1, // TEMPORARY — see PRODUCT_PRICES
};
const DEFAULT_ITEM_WEIGHT_OZ = 16;
const PACKAGING_WEIGHT_OZ = 6; // box/padding buffer added on top of item weight
const PARCEL_DIMENSIONS_IN = { length: 14, width: 10, height: 5 }; // reasonable default box

// TEMPORARY — product ids that never carry a real shipping charge (used for
// the live-payment test item above). If every item in the cart is in this
// set, resolveShipping() returns $0 instead of a real rate. Delete this
// along with the PRODUCT_PRICES/PRODUCT_WEIGHTS_OZ entries above once live
// testing is done.
const DIGITAL_PRODUCT_IDS = new Set(['svk-live-payment-test']);

// True when every item in a validated cart is "digital" (no real shipping).
// Shared by resolveShipping() (the actual charge) and get-shipping-rates.js
// (the rate-selection UI the customer sees) so both agree — otherwise a
// customer picks a $12.95 option that then charges $0, which is confusing.
function isDigitalOnlyCart(items) {
  return !!(items && items.length) && items.every(i => DIGITAL_PRODUCT_IDS.has(i.id));
}

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

// validateCart looks products up in three places:
//   1. PRODUCT_PRICES — the static catalog (harnesses, connectors, merch)
//   2. the `used_parts` Supabase table — one-off used parts listed by the admin
//   3. the `parts_catalog` Supabase table — 3D Parts / Other Parts / Relay &
//      Power Kits items added through the admin panel
// A supabase client is required to validate carts that might contain used
// parts or catalog parts; omit it only for callers that never touch either.
async function validateCart(items, supabase) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty or invalid.');
  }

  const unknownIds = [...new Set(items.filter(i => PRODUCT_PRICES[i.id] === undefined).map(i => i.id))];
  let usedPartsById = {};
  let catalogPartsById = {};
  if (unknownIds.length) {
    if (!supabase) {
      throw new Error(`Unknown product: ${unknownIds[0]}`);
    }
    const { data: usedParts, error: usedErr } = await supabase
      .from('used_parts')
      .select('id, title, price, weight_oz, status')
      .in('id', unknownIds);
    if (usedErr) throw new Error(`Failed to look up used parts: ${usedErr.message}`);
    usedPartsById = Object.fromEntries((usedParts || []).map(p => [p.id, p]));

    const stillUnknown = unknownIds.filter(id => !usedPartsById[id]);
    if (stillUnknown.length) {
      const { data: catalogParts, error: catalogErr } = await supabase
        .from('parts_catalog')
        .select('id, title, price, weight_oz, status')
        .in('id', stillUnknown);
      if (catalogErr) throw new Error(`Failed to look up parts catalog: ${catalogErr.message}`);
      catalogPartsById = Object.fromEntries((catalogParts || []).map(p => [p.id, p]));
    }
  }

  let subtotal = 0;
  const validated = [];
  for (const item of items) {
    const staticPrice = PRODUCT_PRICES[item.id];
    const usedPart = staticPrice === undefined ? usedPartsById[item.id] : null;
    const catalogPart = staticPrice === undefined && !usedPart ? catalogPartsById[item.id] : null;

    if (staticPrice === undefined && !usedPart && !catalogPart) {
      throw new Error(`Unknown product: ${item.id}`);
    }
    if (usedPart && usedPart.status !== 'available') {
      throw new Error(`"${usedPart.title}" just sold and is no longer available.`);
    }
    if (catalogPart && catalogPart.status !== 'available') {
      throw new Error(`"${catalogPart.title}" isn't available for purchase yet.`);
    }

    const price = usedPart ? Number(usedPart.price) : catalogPart ? Number(catalogPart.price) : staticPrice;
    // Used parts are one-off — never more than one of the same listing.
    const quantity = usedPart ? 1 : Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (usedPart && Number(item.quantity) > 1) {
      throw new Error(`Only one of "${usedPart.title}" is available.`);
    }
    const weightOz = usedPart
      ? (usedPart.weight_oz || DEFAULT_ITEM_WEIGHT_OZ)
      : catalogPart
        ? (catalogPart.weight_oz || DEFAULT_ITEM_WEIGHT_OZ)
        : (PRODUCT_WEIGHTS_OZ[item.id] ?? DEFAULT_ITEM_WEIGHT_OZ);
    const lineTotal = price * quantity;
    subtotal += lineTotal;
    validated.push({
      id: item.id,
      name: item.name,
      image: item.image,
      options: item.options || {},
      price,
      quantity,
      lineTotal,
      weightOz,
      isUsedPart: !!usedPart,
    });
  }
  return { items: validated, subtotal };
}

// Total estimated parcel weight for a validated cart, in ounces.
function totalWeightOz(items) {
  const itemsWeight = items.reduce((sum, item) => sum + (item.weightOz ?? DEFAULT_ITEM_WEIGHT_OZ) * item.quantity, 0);
  return itemsWeight + PACKAGING_WEIGHT_OZ;
}

// How long an inventory reservation holds before it's treated as abandoned
// and becomes claimable again. Long enough for a customer to fill out a card
// form; short enough that a truly abandoned cart doesn't lock a one-off part
// away from real buyers for long.
const RESERVATION_TTL_MINUTES = 20;

// Atomically holds one-off used parts for this order, via a security-definer
// Postgres function (see netlify/supabase-used-parts-reservation-migration.sql)
// so two concurrent checkouts can never both reserve — and therefore never
// both pay for — the same physical item. Throws a customer-safe error naming
// whatever couldn't be claimed; the caller should treat that as fatal for
// the whole checkout (don't charge a card for a cart that can't be fulfilled).
async function reserveUsedParts(supabase, items, orderId) {
  const usedItems = (items || []).filter(i => i.isUsedPart);
  if (!usedItems.length) return;

  const ids = usedItems.map(i => i.id);
  const { data, error } = await supabase.rpc('reserve_used_parts', {
    p_ids: ids,
    p_order_id: orderId,
    p_ttl_minutes: RESERVATION_TTL_MINUTES,
  });
  if (error) {
    console.error('[reserveUsedParts] RPC failed:', error.message);
    throw new Error('Could not reserve inventory for your order — please try again.');
  }

  const reservedIds = new Set((data || []).map(row => row.id));
  const unavailable = usedItems.filter(i => !reservedIds.has(i.id));

  if (unavailable.length) {
    // All-or-nothing: roll back whatever this call DID manage to claim
    // rather than charge for a partial cart.
    if (reservedIds.size) {
      await releaseUsedPartsReservation(supabase, Array.from(reservedIds), orderId);
    }
    const names = unavailable.map(i => `"${i.name}"`).join(', ');
    const verb = unavailable.length > 1 ? 'were' : 'was';
    throw new Error(`${names} just sold and ${verb} claimed by another order. Please remove ${unavailable.length > 1 ? 'them' : 'it'} from your cart and try again.`);
  }
}

// Releases a reservation this order holds — guarded by order id so a
// delayed or duplicate call (e.g. a redelivered webhook) can never release
// inventory a *different* order has since legitimately claimed.
async function releaseUsedPartsReservation(supabase, ids, orderId) {
  if (!ids || !ids.length) return;
  const { error } = await supabase.rpc('release_used_parts_reservation', { p_ids: ids, p_order_id: orderId });
  if (error) console.error('[releaseUsedPartsReservation] Failed to release:', ids, error.message);
  else console.log('[releaseUsedPartsReservation] Released:', ids.join(', '));
}

// Marks any used parts in a paid order as sold, so they drop off the public
// listing (RLS only shows status='available' to non-admins). Best-effort —
// logs but doesn't throw, since this runs after payment already succeeded
// and shouldn't block the confirmation flow.
async function markUsedPartsSold(supabase, items) {
  const ids = (items || []).filter(i => i.isUsedPart).map(i => i.id);
  if (!ids.length) return;
  const { error } = await supabase
    .from('used_parts')
    .update({ status: 'sold', sold_at: new Date().toISOString() })
    .in('id', ids);
  if (error) console.error('[markUsedPartsSold] Failed to mark sold:', ids, error.message);
  else console.log('[markUsedPartsSold] Marked sold:', ids.join(', '));
}

// Inverse of markUsedPartsSold — releases inventory back to available when a
// paid order containing one-off used parts is cancelled, so it can be sold
// to someone else instead of being stuck "sold" with no buyer.
async function releaseUsedParts(supabase, items) {
  const ids = (items || []).filter(i => i.isUsedPart).map(i => i.id);
  if (!ids.length) return;
  const { error } = await supabase
    .from('used_parts')
    .update({ status: 'available', sold_at: null })
    .in('id', ids);
  if (error) console.error('[releaseUsedParts] Failed to release:', ids, error.message);
  else console.log('[releaseUsedParts] Released back to available:', ids.join(', '));
}

// Resolves a shipping selection to an authoritative price + label.
// shippingOptionId is either:
//   - a flat-rate key from SHIPPING_OPTIONS (fallback path), or
//   - a Shippo rate object_id (live rate path) — re-verified against Shippo,
//     never trusting a client-supplied dollar amount.
// `items` is optional — when every item in the cart is a "digital" product
// (see DIGITAL_PRODUCT_IDS), shipping is $0 regardless of the selected
// option, since nothing physical ships.
async function resolveShipping(shippingOptionId, items = []) {
  if (isDigitalOnlyCart(items)) {
    return { shipping: 0, shippingLabel: 'Digital delivery — no shipping required' };
  }

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
function calculateTotals(subtotal, shipping, state, discount = 0) {
  // Discount comes off the goods before tax, so the customer isn't taxed on
  // money they didn't pay. Clamped to the subtotal so a large fixed-amount
  // code can never make the order negative or discount the shipping.
  const appliedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const taxBase = subtotal - appliedDiscount + shipping;
  const tax = (state === 'TX') ? Math.round(taxBase * TX_TAX_RATE * 100) / 100 : 0;
  const grandTotal = Math.round((taxBase + tax) * 100) / 100;
  return { tax, grandTotal, discount: Math.round(appliedDiscount * 100) / 100 };
}

/**
 * Resolves a customer-supplied discount code to an authoritative dollar
 * amount. Never trust a discount computed in the browser — same principle as
 * resolveShipping() re-verifying the shipping rate server-side.
 *
 * Throws a customer-safe Error when the code can't be applied; returns
 * { discount, discountCode, discountCodeId, label } when it can.
 */
async function resolveDiscount(supabase, code, subtotal) {
  const trimmed = (code || '').trim();
  if (!trimmed) return { discount: 0, discountCode: null, discountCodeId: null, label: null };
  if (!supabase) throw new Error('Discount codes are unavailable right now.');

  const { data: row, error } = await supabase
    .from('discount_codes')
    .select('id, code, kind, value, min_subtotal, max_uses, times_used, starts_at, expires_at, active')
    .ilike('code', trimmed)
    .maybeSingle();

  // Deliberately identical message for "no such code" and "code is disabled",
  // so the endpoint can't be used to discover which codes exist.
  if (error || !row || !row.active) {
    throw new Error('That discount code isn\'t valid.');
  }

  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) {
    throw new Error('That discount code isn\'t active yet.');
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < now) {
    throw new Error('That discount code has expired.');
  }
  if (row.max_uses !== null && row.times_used >= row.max_uses) {
    throw new Error('That discount code has reached its usage limit.');
  }
  const minSubtotal = Number(row.min_subtotal) || 0;
  if (subtotal < minSubtotal) {
    throw new Error(`That code requires a subtotal of at least $${minSubtotal.toFixed(2)}.`);
  }

  const value = Number(row.value);
  const raw = row.kind === 'percent' ? (subtotal * value) / 100 : value;
  const discount = Math.min(Math.round(raw * 100) / 100, subtotal);

  return {
    discount,
    discountCode: row.code,
    discountCodeId: row.id,
    label: row.kind === 'percent' ? `${value}% off` : `$${value.toFixed(2)} off`,
  };
}

/**
 * Records one redemption. Called only after payment succeeds, so an abandoned
 * checkout never burns a use. Returns false if the code hit its cap in the
 * meantime (the order still stands — we don't punish the customer for a race).
 */
async function consumeDiscount(supabase, code) {
  if (!code) return true;
  const { data: row, error: lookupError } = await supabase
    .from('discount_codes')
    .select('id')
    .ilike('code', code)
    .maybeSingle();
  if (lookupError || !row) {
    console.error('[consumeDiscount] Code not found when recording redemption:', code);
    return false;
  }
  const { data, error } = await supabase.rpc('consume_discount_code', { p_id: row.id });
  if (error) {
    console.error('[consumeDiscount] Failed to record redemption:', error.message);
    return false;
  }
  if (data !== true) {
    // Hit its cap between checkout and payment. The order still stands — the
    // customer already paid the discounted price and that's not their fault.
    console.warn(`[consumeDiscount] ${code} was at its usage limit; order honoured anyway.`);
  }
  return data === true;
}

module.exports = {
  validateCart,
  resolveShipping,
  calculateTotals,
  resolveDiscount,
  consumeDiscount,
  totalWeightOz,
  isDigitalOnlyCart,
  reserveUsedParts,
  releaseUsedPartsReservation,
  markUsedPartsSold,
  releaseUsedParts,
  SHIPPING_OPTIONS,
  PRODUCT_PRICES,
  PARCEL_DIMENSIONS_IN,
  TX_TAX_RATE,
};
