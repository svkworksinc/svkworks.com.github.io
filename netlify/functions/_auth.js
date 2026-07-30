// Resolves a client-supplied Supabase access token to a verified user id.
// Never trust a client-supplied user id directly — anyone could claim to be
// anyone. Verifying the JWT server-side (against the service-role client,
// which can validate any user's token) proves who actually placed the order.
async function resolveUserId(supabase, accessToken) {
  if (!accessToken) return null;
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    // An auth hiccup shouldn't block someone from checking out — falls back
    // to a guest order (user_id: null), same as if they weren't signed in.
    return null;
  }
}

module.exports = { resolveUserId };
