// TESTING MODE — set TEST_MODE=true in Netlify env vars to suppress customer emails.
// Test orders send only to the internal BCC address so real inboxes aren't spammed.
const TEST_MODE = process.env.TEST_MODE === 'true';

const PDFDocument = require('pdfkit');

function itemOptionsText(item) {
  return Object.entries(item.options || {})
    .filter(([, v]) => v && v !== 'No')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

async function generateInvoicePDF({
  customerName, customerEmail, orderNumber, orderDate,
  items, subtotal, shipping, shippingLabel, tax, total,
  shippingAddress, paymentMethod,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true, bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const magenta = '#e91e8c';
    const nearBlack = '#111111';
    const midGray = '#888888';
    const lightGray = '#cccccc';
    const offWhite = '#f5f5f5';
    const pageWidth = 595 - 100; // usable width with 50px margins each side
    const hasBreakdown = subtotal !== undefined && shipping !== undefined;

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 72).fill('#0a0a0a');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('SVK Works', 50, 22);
    doc.fillColor(midGray).fontSize(10).font('Helvetica').text('Order Invoice', 50, 48);
    doc.fillColor('#aaaaaa').fontSize(9).text('svkworks.com', 50, 48, { align: 'right', width: pageWidth });

    // ── Order meta ────────────────────────────────────────────────────────────
    doc.fillColor(nearBlack).fontSize(11).font('Helvetica-Bold').text('Order Confirmation', 50, 90);
    doc.fillColor(magenta).fontSize(17).text(orderNumber, 50, 106);

    doc.fillColor(midGray).fontSize(9).font('Helvetica');
    doc.text('Date:      ' + orderDate, 50, 134);
    doc.text('Customer:  ' + customerName, 50, 148);
    doc.text('Email:     ' + customerEmail, 50, 162);
    doc.text('Payment:   ' + paymentMethod, 50, 176);

    let metaY = 176;
    if (shippingAddress) {
      doc.text('Ship To:   ' + shippingAddress.address, 50, metaY + 14);
      doc.text('           ' + shippingAddress.city + ', ' + shippingAddress.state + ' ' + shippingAddress.zip, 50, metaY + 28);
      metaY += 28;
    }
    if (shippingLabel) {
      doc.text('Via:       ' + shippingLabel, 50, metaY + 14);
      metaY += 14;
    }

    // ── Items table ──────────────────────────────────────────────────────────
    const tableTop = metaY + 28;
    const col = { item: 50, qty: 360, price: 410, total: 470 };
    const optsWidth = col.qty - col.item - 16;

    // Header row
    doc.rect(50, tableTop, pageWidth, 20).fill('#0a0a0a');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    doc.text('ITEM', col.item + 8, tableTop + 6);
    doc.text('QTY', col.qty, tableTop + 6);
    doc.text('PRICE', col.price, tableTop + 6);
    doc.text('TOTAL', col.total, tableTop + 6);

    let y = tableTop + 22;
    items.forEach((item, i) => {
      const optStr = itemOptionsText(item);
      const rowH = optStr ? 34 : 22;
      if (i % 2 === 0) doc.rect(50, y - 2, pageWidth, rowH).fill(offWhite);

      doc.font('Helvetica').fontSize(9).fillColor(nearBlack)
        .text(item.name, col.item + 8, y, { width: 295, lineBreak: false });
      if (optStr) {
        doc.font('Helvetica').fontSize(7.5).fillColor(midGray)
          .text(optStr, col.item + 8, y + 12, { width: optsWidth, lineBreak: false });
      }
      doc.font('Helvetica').fontSize(9).fillColor(nearBlack).text(String(item.quantity), col.qty, y);
      doc.text('$' + (item.price || 0).toFixed(2), col.price, y);
      doc.fillColor(magenta).text('$' + (item.lineTotal || 0).toFixed(2), col.total, y);
      y += rowH;
    });

    // ── Totals section ───────────────────────────────────────────────────────
    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lightGray).lineWidth(0.5).stroke();
    y += 14;

    const lx = col.price - 40; // 370 — label x
    const ax = col.total;       // 470 — amount x
    const aw = 75;              // amount column width to page edge

    if (hasBreakdown) {
      doc.fillColor(midGray).fontSize(9).font('Helvetica');
      doc.text('Subtotal', lx, y);
      doc.text('$' + (subtotal || 0).toFixed(2), ax, y, { width: aw, align: 'right' });
      y += 15;

      doc.text('Shipping', lx, y);
      doc.text('$' + (shipping || 0).toFixed(2), ax, y, { width: aw, align: 'right' });
      y += 15;

      if (tax && tax > 0) {
        doc.text('Tax (TX 8.25%)', lx, y);
        doc.text('$' + tax.toFixed(2), ax, y, { width: aw, align: 'right' });
        y += 15;
      }

      doc.moveTo(lx, y - 2).lineTo(545, y - 2).strokeColor(lightGray).lineWidth(0.5).stroke();
      y += 6;
    }

    doc.fillColor(midGray).fontSize(10).font('Helvetica').text('Order Total', lx, y);
    const totalStr = '$' + (total || 0).toFixed(2);
    doc.fillColor(magenta).fontSize(18).font('Helvetica-Bold');
    doc.text(totalStr, 545 - doc.widthOfString(totalStr), y - 2, { lineBreak: false });

    // ── Footer ────────────────────────────────────────────────────────────────
    y += 46;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lightGray).lineWidth(0.5).stroke();
    y += 10;
    doc.fillColor(midGray).fontSize(8).font('Helvetica')
      .text('Questions? Reply to your confirmation email or contact us at info@svkworks.com', 50, y, { align: 'center', width: pageWidth });
    doc.text('SVK Works — Built in-house, one at a time.', 50, y + 14, { align: 'center', width: pageWidth });

    doc.end();
  });
}

async function sendInvoiceEmail({
  customerName, customerEmail, orderNumber, orderDate,
  items, subtotal, shipping, shippingLabel, tax, total,
  shippingAddress, paymentMethod,
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const fmtMoney = n => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasBreakdown = subtotal !== undefined && shipping !== undefined;

  const rows = items.map(item => {
    const optStr = itemOptionsText(item);
    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #2a2a2a;">${item.name}${optStr ? `<br><span style="font-size:12px;color:#888;">${optStr}</span>` : ''}</td>
        <td style="padding:12px;border-bottom:1px solid #2a2a2a;text-align:center;">${item.quantity}</td>
        <td style="padding:12px;border-bottom:1px solid #2a2a2a;text-align:right;">$${fmtMoney(item.price)}</td>
        <td style="padding:12px;border-bottom:1px solid #2a2a2a;text-align:right;color:#e91e8c;font-weight:600;">$${fmtMoney(item.lineTotal)}</td>
      </tr>`;
  }).join('');

  // Meta info grid — table-based (not flex) so it renders consistently in Outlook/older webmail clients.
  const metaCells = [
    { label: 'Order Number', value: orderNumber, accent: true },
    { label: 'Date', value: orderDate },
    { label: 'Payment', value: paymentMethod },
  ];
  if (shippingLabel) metaCells.push({ label: 'Shipping', value: shippingLabel });

  const metaCellsHtml = metaCells.map(c => `
    <td style="padding:0 24px 16px 0;vertical-align:top;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;margin-bottom:4px;">${c.label}</div>
      <div style="font-size:14px;font-weight:${c.accent ? 700 : 400};color:${c.accent ? '#e91e8c' : '#e5e5e5'};">${c.value}</div>
    </td>`).join('');

  const shipToRow = shippingAddress
    ? `<tr><td style="padding:0 0 16px 0;" colspan="4">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#555;margin-bottom:4px;">Ship To</div>
        <div style="font-size:14px;color:#e5e5e5;">${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}</div>
      </td></tr>`
    : '';

  const totalsHtml = hasBreakdown
    ? `<table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
        <tr>
          <td style="font-size:13px;color:#888;padding:3px 0;">Subtotal</td>
          <td style="font-size:13px;text-align:right;padding:3px 0;color:#e5e5e5;">$${fmtMoney(subtotal)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#888;padding:3px 0;">${shippingLabel ? `Shipping (${shippingLabel})` : 'Shipping'}</td>
          <td style="font-size:13px;text-align:right;padding:3px 0;color:#e5e5e5;">$${fmtMoney(shipping)}</td>
        </tr>
        ${(tax || 0) > 0 ? `<tr>
          <td style="font-size:13px;color:#888;padding:3px 0;">Tax (TX 8.25%)</td>
          <td style="font-size:13px;text-align:right;padding:3px 0;color:#e5e5e5;">$${fmtMoney(tax)}</td>
        </tr>` : ''}
      </table>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media (max-width: 600px) {
    .svk-meta-table, .svk-meta-table tbody, .svk-meta-table tr, .svk-meta-table td { display: block !important; width: 100% !important; padding-right: 0 !important; }
    .svk-meta-table td { padding-bottom: 14px !important; }
    .svk-items-table th:nth-child(3), .svk-items-table td:nth-child(3) { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#e5e5e5;">
<div style="max-width:600px;margin:32px auto;background:#111;border:1px solid #222;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <table style="width:100%;border-collapse:collapse;background:#0a0a0a;border-bottom:1px solid #222;">
    <tr>
      <td style="padding:28px 32px;">
        <img src="https://www.svkworks.com/img/svk-logo.png" alt="SVK Works" style="height:36px;width:auto;vertical-align:middle;margin-right:16px;" />
        <span style="display:inline-block;vertical-align:middle;">
          <span style="display:block;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#888;">Order Confirmation</span>
          <span style="display:block;font-size:18px;font-weight:700;color:#fff;">SVK Works</span>
        </span>
      </td>
    </tr>
  </table>
  <!-- Body -->
  <div style="padding:32px;">
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Thanks, ${customerName}!</p>
    <p style="margin:0 0 28px;color:#888;font-size:14px;">Your payment has been received and your build is now in queue.</p>

    <table class="svk-meta-table" style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <tr>${metaCellsHtml}</tr>
      ${shipToRow}
    </table>

    <!-- Items Table -->
    <table class="svk-items-table" style="width:100%;border-collapse:collapse;margin-bottom:24px;margin-top:16px;">
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

    <!-- Totals breakdown + grand total -->
    <div style="border-top:1px solid #333;padding-top:16px;margin-bottom:28px;">
      ${totalsHtml}
      <table style="width:100%;border-collapse:collapse;${hasBreakdown ? 'border-top:1px solid #222;' : ''}">
        <tr>
          <td style="padding-top:${hasBreakdown ? '12px' : '0'};font-size:14px;color:#888;">Order Total</td>
          <td style="padding-top:${hasBreakdown ? '12px' : '0'};text-align:right;font-size:22px;font-weight:700;color:#e91e8c;">$${fmtMoney(total)}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 8px;font-size:13px;color:#666;">
      Your invoice PDF is attached to this email for your records.
    </p>
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

  // Generate PDF invoice
  let pdfAttachment;
  try {
    const pdfBuffer = await generateInvoicePDF({
      customerName, customerEmail, orderNumber, orderDate,
      items, subtotal, shipping, shippingLabel, tax, total,
      shippingAddress, paymentMethod,
    });
    pdfAttachment = { filename: `invoice-${orderNumber}.pdf`, content: pdfBuffer.toString('base64') };
    console.log(`[email] PDF generated for ${orderNumber}, size: ${pdfBuffer.length} bytes`);
  } catch (pdfErr) {
    console.error(`[email] PDF generation failed for ${orderNumber}:`, pdfErr.message);
    pdfAttachment = null;
  }

  const basePayload = TEST_MODE
    ? { from: 'SVK Works <orders@svkworks.com>', to: 'info@svkworks.com', subject: `[TEST] Order Confirmed — ${orderNumber} | SVK Works`, html }
    : { from: 'SVK Works <orders@svkworks.com>', to: customerEmail, bcc: 'info@svkworks.com', subject: `Order Confirmed — ${orderNumber} | SVK Works`, html };

  const emailPayload = pdfAttachment
    ? { ...basePayload, attachments: [pdfAttachment] }
    : basePayload;

  const recipient = TEST_MODE ? 'info@svkworks.com' : customerEmail;
  console.log(`[email] Sending invoice for ${orderNumber} to ${recipient}${TEST_MODE ? ' [TEST MODE — customer email suppressed]' : ''}${pdfAttachment ? ' with PDF attachment' : ' (no PDF)'}`);

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
