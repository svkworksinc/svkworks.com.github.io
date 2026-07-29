// TESTING MODE — set TEST_MODE=true in Netlify env vars to suppress customer emails.
// Test orders send only to the internal BCC address so real inboxes aren't spammed.
const TEST_MODE = process.env.TEST_MODE === 'true';

async function sendInvoiceEmail({ customerName, customerEmail, orderNumber, orderDate, items, total, paymentMethod }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const rows = items.map(item => {
    const optStr = Object.entries(item.options || {})
      .filter(([, v]) => v && v !== 'No')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;">${item.name}${optStr ? `<br><span style="font-size:12px;color:#888;">${optStr}</span>` : ''}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;text-align:right;">$${item.price.toLocaleString()}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;text-align:right;color:#e91e8c;">$${item.lineTotal.toLocaleString()}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#e5e5e5;">
<div style="max-width:600px;margin:32px auto;background:#111;border:1px solid #222;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <div style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #222;display:flex;align-items:center;gap:16px;">
    <img src="https://www.svkworks.com/img/svk-logo.png" alt="SVK Works" style="height:36px;width:auto;" />
    <div>
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#888;">Order Confirmation</div>
      <div style="font-size:18px;font-weight:700;color:#fff;">SVK Works</div>
    </div>
  </div>
  <!-- Body -->
  <div style="padding:32px;">
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Thanks, ${customerName}!</p>
    <p style="margin:0 0 28px;color:#888;font-size:14px;">Your payment has been received and your build is now in queue.</p>

    <div style="display:flex;gap:24px;margin-bottom:28px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;margin-bottom:4px;">Order Number</div>
        <div style="font-size:14px;font-weight:600;color:#e91e8c;">${orderNumber}</div>
      </div>
      <div>
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;margin-bottom:4px;">Date</div>
        <div style="font-size:14px;">${orderDate}</div>
      </div>
      <div>
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;margin-bottom:4px;">Payment</div>
        <div style="font-size:14px;">${paymentMethod}</div>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#0a0a0a;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;">Item</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;">Price</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="border-top:1px solid #333;padding-top:16px;text-align:right;margin-bottom:28px;">
      <span style="font-size:14px;color:#888;margin-right:24px;">Order Total</span>
      <span style="font-size:22px;font-weight:700;color:#e91e8c;">$${total.toLocaleString()}</span>
    </div>

    <div style="background:#0a0a0a;border:1px solid #222;border-radius:6px;padding:20px;margin-bottom:28px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;margin-bottom:8px;">What's Next</div>
      <p style="margin:0;font-size:14px;color:#aaa;line-height:1.6;">
        Your harness build is now in our queue. Lead time is typically <strong style="color:#e5e5e5;">5–7 weeks</strong> from order. We'll reach out at <strong style="color:#e5e5e5;">${customerEmail}</strong> with updates on your build and tracking once shipped.
      </p>
    </div>

    <p style="margin:0;font-size:13px;color:#666;">
      Questions? Reply to this email or contact us at <a href="mailto:info@svkworks.com" style="color:#e91e8c;">info@svkworks.com</a>.
    </p>
  </div>
  <!-- Footer -->
  <div style="padding:20px 32px;border-top:1px solid #1a1a1a;text-align:center;">
    <p style="margin:0;font-size:12px;color:#444;"><a href="https://www.svkworks.com" style="color:#555;text-decoration:none;">svkworks.com</a> — Built in-house, one at a time.</p>
  </div>
</div>
</body>
</html>`;

  const emailPayload = TEST_MODE
    // In test mode: send only to the internal address; never email the test customer
    ? { from: 'SVK Works <orders@svkworks.com>', to: 'info@svkworks.com', subject: `[TEST] Order Confirmed — ${orderNumber} | SVK Works`, html }
    : { from: 'SVK Works <orders@svkworks.com>', to: customerEmail, bcc: 'info@svkworks.com', subject: `Order Confirmed — ${orderNumber} | SVK Works`, html };

  const recipient = TEST_MODE ? 'info@svkworks.com' : customerEmail;
  console.log(`[email] Sending invoice for ${orderNumber} to ${recipient}${TEST_MODE ? ' [TEST MODE — customer email suppressed]' : ''}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(emailPayload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  const data = await res.json();
  console.log(`[email] Invoice sent for ${orderNumber}, Resend ID: ${data.id}`);
}

module.exports = { sendInvoiceEmail };
