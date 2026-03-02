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

      create policy "Users view own orders"
        on orders for select using (auth.uid() = user_id);

      create policy "Users insert own orders"
        on orders for insert with check (auth.uid() = user_id);

   ============================================ */

const SUPABASE_URL = 'https://czdoptpeyffzjzqueogs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jMz6NBLEe1JI8BWCjVN2nQ_EzlIY3np';

const SVKAuth = {
  client: null,

  // Resolves when init() has completed — await this before calling auth methods
  ready: new Promise(resolve => { SVKAuth._resolveReady = resolve; }),
  _resolveReady: null,

  init() {
    if (!window.supabase || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      // Supabase not configured — resolve ready so pages don't hang
      this._resolveReady();
      return;
    }
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this._resolveReady();
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
    return await this.client.auth.signInWithPassword({ email, password });
  },

  async signUp(email, password, fullName) {
    if (!this.client) return { error: { message: 'Auth not configured.' } };
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (data?.user && !error) {
      await this.client.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
      });
    }
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
    if (!this.client) return;
    const user = await this.getUser();
    if (!user) return;
    await this.client.from('profiles').upsert({ id: user.id, ...updates });
  },

  async resetPassword(email) {
    if (!this.client) return { error: { message: 'Auth not configured.' } };
    return await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/account.html',
    });
  },
};
