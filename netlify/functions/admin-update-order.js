// Single entry point for every admin order mutation — accept, ship, complete,
// cancel (with a real refund), and edit. Centralizing this here (rather than
// letting the admin panel write to Supabase directly) means every change is
// authorized server-side, only valid state transitions are allowed, and
// every action gets an audit-trail row in order_events. See
// netlify/supabase-order-management-migration.sql.
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { resolveUserId } = require('./_auth');
const { releaseUsedParts } = require('./_pricing');
const { refundCapture } = require('./_paypal');
const { sendOrderStatusEmail } = require('./_email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// action -> which current statuses it's legal from, and what it moves to.
const VALID_TRANSITIONS = {
  accept:   { from: ['pending'], to: 'in_progress' },
  ship:     { from: ['in_progress'], to: 'shipped' },
  complete: { from: ['shipped'], to: 'complete' },
  cancel:   { from: ['pending', 'in_progress', 'shipped'], to: 'cancelled' },
};

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function fail(statusCode, error) {
  return { statusCode, body: JSON.stringify({ error }) };
}

async function logEvent(orderId, adminId, adminName, action, fromStatus, toStatus, note) {
  const { error } = await supabase.from('order_events').insert({
    order_id: orderId, admin_id: adminId, admin_name: adminName,
    action, from_status: fromStatus, to_status: toStatus, note: note || null,
  });
  if (error) console.error('[admin-update-order] Failed to log order_event:', error.message);
}

async function handleSimpleTransition(order, action, toStatus, payload, userId, adminName) {
  const { error } = await supabase.from('orders').update({ status: toStatus }).eq('id', order.id);
  if (error) return fail(500, error.message);
  await logEvent(order.id, userId, adminName, action, order.status, toStatus, payload.note);
  return ok({ success: true, status: toStatus });
}

async function handleShip(order, payload, userId, adminName) {
  const trackingNumber = (payload.trackingNumber || '').trim();
  const carrier = (payload.carrier || '').trim();
  if (!trackingNumber) {
    return fail(400, 'Tracking number is required to mark an order shipped.');
  }

  const { error } = await supabase.from('orders').update({
    status: 'shipped', tracking_number: trackingNumber, carrier: carrier || null,
  }).eq('id', order.id);
  if (error) return fail(500, error.message);

  await logEvent(order.id, userId, adminName, 'ship', order.status, 'shipped',
    `Tracking: ${trackingNumber}${carrier ? ' via ' + carrier : ''}`);

  try {
    await sendOrderStatusEmail({
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      orderNumber: order.order_number,
      heading: 'Your Order Has Shipped',
      message: `Your order is on its way! Tracking number: <strong>${trackingNumber}</strong>${carrier ? ` (${carrier})` : ''}.`,
    });
  } catch (err) {
    console.error('[admin-update-order] Shipped email failed:', err.message);
  }

  return ok({ success: true, status: 'shipped' });
}

async function handleCancel(order, payload, userId, adminName) {
  const reason = (payload.reason || '').trim();
  if (!reason) {
    return fail(400, 'A cancellation reason is required.');
  }

  let refundId = null;
  const refundedAmount = Number(order.total_price) || 0;

  if (order.payment_method === 'stripe') {
    // TESTING MODE — same safety gate as create-stripe-intent.js. Never issue
    // a refund against a live Stripe key from this codebase during testing.
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      console.error('SAFETY BLOCK: Stripe key is not a test key. Refunds are disabled during testing.');
      return fail(503, 'Payment processing is in test mode only. Live keys are not permitted.');
    }
    if (!order.payment_id) {
      return fail(422, 'No Stripe payment on this order to refund.');
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const refund = await stripe.refunds.create({ payment_intent: order.payment_id });
    refundId = refund.id;
  } else if (order.payment_method === 'paypal') {
    if (!order.payment_capture_id) {
      return fail(422, 'No PayPal capture on this order to refund.');
    }
    const refund = await refundCapture(order.payment_capture_id);
    refundId = refund.id;
  } else {
    return fail(422, `Unknown payment method: ${order.payment_method}`);
  }

  const { error } = await supabase.from('orders').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason,
    refund_id: refundId,
    refunded_amount: refundedAmount,
  }).eq('id', order.id);
  if (error) return fail(500, error.message);

  // Refunds are the deliverable of this action — best-effort from here on,
  // so a snag in inventory release or the notification email doesn't make
  // the response look like the refund itself failed.
  await releaseUsedParts(supabase, order.items);
  await logEvent(order.id, userId, adminName, 'cancel', order.status, 'cancelled', reason);

  try {
    await sendOrderStatusEmail({
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      orderNumber: order.order_number,
      heading: 'Order Cancelled & Refunded',
      message: `Your order has been cancelled and a full refund of $${refundedAmount.toFixed(2)} has been issued back to your original payment method. Please allow a few business days for it to appear.`,
    });
  } catch (err) {
    console.error('[admin-update-order] Cancellation email failed:', err.message);
  }

  return ok({ success: true, status: 'cancelled', refundId, refundedAmount });
}

async function handleEdit(order, payload, userId, adminName) {
  const updates = {};
  const changedFields = [];

  if (typeof payload.customerName === 'string') {
    updates.customer_name = payload.customerName.trim();
    changedFields.push('customer name');
  }
  if (typeof payload.customerEmail === 'string') {
    updates.customer_email = payload.customerEmail.trim().toLowerCase();
    changedFields.push('customer email');
  }
  if (typeof payload.adminNotes === 'string') {
    updates.admin_notes = payload.adminNotes;
    changedFields.push('admin notes');
  }
  if (payload.shippingAddress && typeof payload.shippingAddress === 'object') {
    updates.options = { ...(order.options || {}), shippingAddress: payload.shippingAddress };
    changedFields.push('shipping address');
  }

  if (!Object.keys(updates).length) {
    return fail(400, 'No changes provided.');
  }

  const { error } = await supabase.from('orders').update(updates).eq('id', order.id);
  if (error) return fail(500, error.message);

  await logEvent(order.id, userId, adminName, 'edit', order.status, order.status, `Updated: ${changedFields.join(', ')}`);
  return ok({ success: true });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { orderId, accessToken, action, ...payload } = JSON.parse(event.body);

    if (!orderId || !accessToken || !action) {
      return fail(400, 'Missing required fields.');
    }

    // Verify the caller is a real, currently-signed-in admin — never trust a
    // client-side claim of admin status for an action this sensitive.
    const userId = await resolveUserId(supabase, accessToken);
    if (!userId) {
      return fail(401, 'Sign in required.');
    }
    const { data: profile } = await supabase.from('profiles').select('full_name, is_admin').eq('id', userId).single();
    if (!profile?.is_admin) {
      return fail(403, 'Admin access required.');
    }
    const adminName = profile.full_name || 'Admin';

    const { data: order, error: fetchErr } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (fetchErr || !order) {
      return fail(404, 'Order not found.');
    }

    if (action === 'edit') {
      return await handleEdit(order, payload, userId, adminName);
    }

    const transition = VALID_TRANSITIONS[action];
    if (!transition) {
      return fail(400, `Unknown action: ${action}`);
    }
    if (!transition.from.includes(order.status)) {
      return fail(409, `Cannot ${action} an order with status "${order.status}".`);
    }

    if (action === 'ship') return await handleShip(order, payload, userId, adminName);
    if (action === 'cancel') return await handleCancel(order, payload, userId, adminName);
    return await handleSimpleTransition(order, action, transition.to, payload, userId, adminName);
  } catch (err) {
    console.error('admin-update-order error:', err);
    return fail(500, err.message || 'Internal server error.');
  }
};
