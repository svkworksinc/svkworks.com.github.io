/* ============================================
   SVK Works — Auth Module
   Backend: Supabase (free tier — supabase.com)

   SETUP (one-time):
   1. Create a free project at https://supabase.com
   2. In Project Settings → API, copy your URL and anon key
   3. Paste them into SUPABASE_URL and SUPABASE_ANON_KEY below
   4. In the Supabase SQL Editor, run this once:

      create table profiles (
        id uuid references auth.users(id) primary key,
        full_name text,
        phone text,
        email text,
        is_admin boolean default false,
        created_at timestamptz default now()
      );

      create table orders (
        id uuid default gen_random_uuid() primary key,
        user_id uuid references auth.users(id) not null,
        product text not null,
        options jsonb not null default '{}',
        total_price integer not null,
        status text default 'pending',
        notes text,
        submitted_at timestamptz default now()
      );

      alter table profiles enable row level security;
      alter table orders enable row level security;

      create policy "Users manage own profile"
        on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

      create policy "Users insert own orders"
        on orders for insert with check (auth.uid() = user_id);

   ADMIN SETUP (run after basic setup):

      -- Security-definer function avoids policy recursion
      create or replace function auth_is_admin()
      returns boolean language sql security definer as $$
        select coalesce((select is_admin from profiles where id = auth.uid()), false)
      $$;

      -- Combined order read policy: own orders + admin sees all
      create policy "Users view own orders"
        on orders for select
        using (auth.uid() = user_id or auth_is_admin());

      -- Admins can update order status
      create policy "Admins update orders"
        on orders for update
        using (auth_is_admin());

      -- Admins can read all profiles (for order management)
      create policy "Admins read profiles"
        on profiles for select
        using (auth.uid() = id or auth_is_admin());

      -- Grant admin to a user (replace with your account's user ID):
      -- update profiles set is_admin = true where id = 'your-uuid-here';

   ============================================ */

const SUPABASE_URL = 'https://czdoptpeyffzjzqueogs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jMz6NBLEe1JI8BWCjVN2nQ_EzlIY3np';

// Resolver must live outside the object so it's captured before SVKAuth is assigned
let _svkResolveReady;

const SVKAuth = {
  client: null,

  // Resolves when init() has completed — await this before calling auth methods
  ready: new Promise(resolve => { _svkResolveReady = resolve; }),

  init() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      // Supabase not configured — resolve ready so pages don't hang
      _svkResolveReady();
      return;
    }
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    _svkResolveReady();
  },

  get configured() {
    return !!this.client;
  },

  async getSession() {
    if (!this.client) return null;
    const { data: { session } } = await this.client.auth.getSession();
    return session;
  },

  async getUser() {
    if (!this.client) return null;
    const { data: { user } } = await this.client.auth.getUser();
    return user;
  },

  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;
    const { data } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    return data;
  },

  async signIn(email, password) {
    if (!this.client) return { error: { message: 'Auth not configured.' } };
    const result = await this.client.auth.signInWithPassword({ email, password });
    if (!result.error && result.data?.user) {
      // Silently sync email to profile (non-blocking)
      this.client.from('profiles').upsert({ id: result.data.user.id, email }).then(() => {});
    }
    return result;
  },

  async signUp(email, password, fullName) {
    if (!this.client) return { error: { message: 'Auth not configured.' } };
    // Profile row is created server-side by the on_auth_user_created trigger
    // (see netlify/supabase-auth-trigger-migration.sql) — it reads full_name
    // back out of this metadata. Writing it from the browser instead used to
    // fail silently pre-email-confirmation, since RLS requires a session.
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { data, error };
  },

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
  },

  async saveOrder(orderData) {
    if (!this.client) return null;
    const user = await this.getUser();
    if (!user) return null;
    const { data, error } = await this.client.from('orders').insert({
      user_id: user.id,
      product: orderData.product,
      options: orderData.options,
      total_price: orderData.totalPrice,
      notes: orderData.notes || '',
    });
    return { data, error };
  },

  async getOrders() {
    if (!this.client) return [];
    const user = await this.getUser();
    if (!user) return [];
    const { data } = await this.client
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false });
    return data || [];
  },

  async updateProfile(updates) {
    if (!this.client) return { data: null, error: { message: 'Auth not configured.' } };
    const user = await this.getUser();
    if (!user) return { data: null, error: { message: 'Not signed in.' } };
    const { data, error } = await this.client.from('profiles').upsert({ id: user.id, ...updates });
    return { data, error };
  },

  async resetPassword(email) {
    if (!this.client) return { error: { message: 'Auth not configured.' } };
    return await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/account.html',
    });
  },

  async isAdmin() {
    const profile = await this.getProfile();
    return !!profile?.is_admin;
  },

  async getAdminOrders() {
    if (!this.client) return [];
    const { data: orders } = await this.client
      .from('orders')
      .select('*')
      // Exclude checkout orders still awaiting payment (abandoned/incomplete carts) —
      // only orders that are actually placed (paid, or quote requests with no payment
      // step) belong in the fulfillment queue.
      .neq('status', 'pending_payment')
      .order('submitted_at', { ascending: false });
    if (!orders?.length) return [];
    // Fetch profiles in parallel to get customer info
    const userIds = [...new Set(orders.map(o => o.user_id))];
    const { data: profiles } = await this.client
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    return orders.map(o => ({ ...o, _profile: profileMap[o.user_id] || {} }));
  },

  async updateOrderStatus(orderId, newStatus) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .select();
  },

  // ---- Used Parts ----
  // Public reads rely on RLS: anon/logged-out visitors only ever see
  // status='available' rows; admins (via auth_is_admin()) see everything.
  // See netlify/supabase-used-parts-migration.sql.

  async getUsedParts() {
    if (!this.client) return [];
    const { data } = await this.client
      .from('used_parts')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getUsedPart(id) {
    if (!this.client) return null;
    const { data } = await this.client
      .from('used_parts')
      .select('*')
      .eq('id', id)
      .single();
    return data || null;
  },

  async getAllUsedPartsAdmin() {
    if (!this.client) return [];
    const { data } = await this.client
      .from('used_parts')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  },

  async saveUsedPart(part) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client.from('used_parts').insert({
      title: part.title,
      description: part.description || '',
      price: part.price,
      condition: part.condition,
      category: part.category || null,
      weight_oz: part.weightOz || 16,
      images: part.images || [],
      admin_notes: part.adminNotes || null,
    }).select().single();
  },

  async updateUsedPart(id, updates) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client.from('used_parts').update(updates).eq('id', id).select().single();
  },

  async deleteUsedPart(id) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client.from('used_parts').delete().eq('id', id);
  },

  async uploadUsedPartImage(file) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await this.client.storage.from('used-parts').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) return { error };
    const { data } = this.client.storage.from('used-parts').getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async deleteUsedPartImage(url) {
    if (!this.client) return;
    const marker = '/used-parts/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length);
    await this.client.storage.from('used-parts').remove([path]);
  },

  // ---- Parts Catalog (3D Parts / Other Parts / Relay & Power Kits) ----
  // Public reads rely on RLS: every row is visible to everyone, including
  // "coming soon" listings — they're meant to be seen, just not purchasable
  // (enforced server-side in netlify/functions/_pricing.js).
  // See netlify/supabase-parts-catalog-migration.sql.

  async getPartsCatalog(subcategory) {
    if (!this.client) return [];
    const { data } = await this.client
      .from('parts_catalog')
      .select('*')
      .eq('subcategory', subcategory)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getPartCatalogItem(id) {
    if (!this.client || !id) return null;
    const { data } = await this.client
      .from('parts_catalog')
      .select('*')
      .eq('id', id)
      .single();
    return data || null;
  },

  async getPartCatalogBySlug(slug) {
    if (!this.client || !slug) return null;
    const { data } = await this.client
      .from('parts_catalog')
      .select('*')
      .eq('slug', slug)
      .single();
    return data || null;
  },

  async getAllPartsCatalogAdmin() {
    if (!this.client) return [];
    const { data } = await this.client
      .from('parts_catalog')
      .select('*')
      .order('subcategory', { ascending: true })
      .order('created_at', { ascending: false });
    return data || [];
  },

  async savePartCatalogItem(part) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client.from('parts_catalog').insert({
      subcategory: part.subcategory,
      title: part.title,
      slug: part.slug || null,
      description: part.description || '',
      price: part.price || 0,
      engine: part.engine || null,
      weight_oz: part.weightOz || 16,
      images: part.images || [],
      status: part.status || 'coming_soon',
    }).select().single();
  },

  async updatePartCatalogItem(id, updates) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client.from('parts_catalog').update(updates).eq('id', id).select().single();
  },

  async deletePartCatalogItem(id) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    return await this.client.from('parts_catalog').delete().eq('id', id);
  },

  async uploadPartCatalogImage(file) {
    if (!this.client) return { error: { message: 'Not configured.' } };
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await this.client.storage.from('parts-catalog').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) return { error };
    const { data } = this.client.storage.from('parts-catalog').getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async deletePartCatalogImage(url) {
    if (!this.client) return;
    const marker = '/parts-catalog/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length);
    await this.client.storage.from('parts-catalog').remove([path]);
  },
};
