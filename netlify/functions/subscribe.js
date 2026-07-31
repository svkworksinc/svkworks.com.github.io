// Newsletter signup.
//
// Runs server-side with the service-role client so newsletter_subscribers can
// stay closed to the public entirely — if the browser could insert (or select)
// directly, the table would double as an oracle for "is this address already
// subscribed?". Repeat signups are treated as success for the same reason.
const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientKey, tooManyRequests } = require('./_ratelimit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Deliberately permissive: just enough structure to reject obvious junk without
// bouncing unusual-but-valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const rl = await checkRateLimit(supabase, clientKey(event), 'subscribe', {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  try {
    const { email, source } = JSON.parse(event.body);
    const trimmed = (email || '').trim().toLowerCase();

    if (!trimmed || !EMAIL_RE.test(trimmed) || trimmed.length > 254) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Please enter a valid email address.' }),
      };
    }

    const { error } = await supabase
      .from('newsletter_subscribers')
      .upsert(
        { email: trimmed, source: (source || 'footer').slice(0, 64) },
        { onConflict: 'email', ignoreDuplicates: true }
      );

    if (error) {
      console.error('subscribe error:', error.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not sign you up right now.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('subscribe error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not sign you up right now.' }) };
  }
};
