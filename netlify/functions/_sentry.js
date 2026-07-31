// Shared Sentry init for payment-critical Netlify functions. Each function
// runs as its own isolated Lambda, so init has to happen per-file — this
// just centralizes the "skip silently if no DSN is configured" guard and
// makes sure init only runs once per warm container.
const Sentry = require('@sentry/node');

let initialized = false;

function initSentry() {
  if (initialized) return;
  initialized = true;
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

async function captureException(err) {
  if (!process.env.SENTRY_DSN) return;
  initSentry();
  Sentry.captureException(err);
  await Sentry.flush(2000);
}

module.exports = { captureException };
