// Shared "a payment cleared — finish the order" routine.
//
// Two independent paths can reach this for a Stripe order:
//   1. stripe-webhook.js, when Stripe delivers payment_intent.succeeded
//   2. confirm-stripe-order.js, called by the browser on the confirmation
//      page after Stripe redirects back
//
// Both exist on purpose: a webhook that's misconfigured, delayed, or
// retried would otherwise mean the customer silently never receives an
// order confirmation. Whichever path arrives first does the work; the
// other no-ops, because this only acts on orders still in
// 'pending_payment' and flips that status before doing anything else.
//
// Keeping this in one place stops the two callers from drifting apart.
const { sendInvoiceEmail, sendNewOrderAdminEmail } = require('./_email');
const { markUsedPartsSold, consumeDiscount } = require('./_pricing');

/**
 * @returns {Promise<{finalized: boolean, reason?: string}>}
 *   finalized:false means another path already handled this order.
 */
async function finalizePaidOrder(supabase, order, { paymentMethodLabel, extraUpdates = {}, logPrefix = '[finalize]' }) {
  if (order.status !== 'pending_payment') {
    console.log(`${logPrefix} Order ${order.order_number} already processed (status: ${order.status}) — skipping`);
    return { finalized: false, reason: 'already_processed' };
  }

  // Claim the order first. Two concurrent callers both read 'pending_payment',
  // but only the one whose UPDATE matches the still-pending row proceeds —
  // so the customer can't get two confirmation emails for one order.
  const { data: claimed, error: claimError } = await supabase
    .from('orders')
    // 'pending' matches the admin panel's fulfillment vocabulary
    // (pending -> in_progress -> shipped -> complete), so a paid order shows
    // up under the "Pending" filter instead of an unrecognized 'paid' status.
    .update({ status: 'pending', ...extraUpdates })
    .eq('id', order.id)
    .eq('status', 'pending_payment')
    .select('id');

  if (claimError) {
    console.error(`${logPrefix} Failed to claim order ${order.order_number}:`, claimError.message);
    throw new Error(`Failed to update order: ${claimError.message}`);
  }
  if (!claimed || !claimed.length) {
    console.log(`${logPrefix} Order ${order.order_number} claimed by another path — skipping`);
    return { finalized: false, reason: 'raced' };
  }

  await markUsedPartsSold(supabase, order.items);
  // Only now that payment cleared does a discount code burn a use.
  await consumeDiscount(supabase, order.discount_code);

  const opts = order.options || {};
  const orderDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const common = {
    orderNumber: order.order_number,
    orderDate,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    items: order.items || [],
    subtotal: opts.subtotal,
    shipping: opts.shipping,
    shippingLabel: opts.shippingLabel,
    tax: opts.tax,
    total: order.total_price,
    shippingAddress: opts.shippingAddress,
    paymentMethod: paymentMethodLabel,
  };

  // Both sends are independently guarded: payment has already succeeded, so
  // neither a failed customer receipt nor a failed internal alert may fail
  // the order — and one failing must not prevent the other from going out.
  console.log(`${logPrefix} Sending customer invoice for ${order.order_number}`);
  try {
    await sendInvoiceEmail(common);
  } catch (err) {
    console.error(`${logPrefix} Customer invoice failed for ${order.order_number}:`, err.message);
  }

  console.log(`${logPrefix} Sending admin new-order alert for ${order.order_number}`);
  try {
    await sendNewOrderAdminEmail({ ...common, customerNotes: order.notes });
  } catch (err) {
    console.error(`${logPrefix} Admin alert failed for ${order.order_number}:`, err.message);
  }

  return { finalized: true };
}

module.exports = { finalizePaidOrder };
