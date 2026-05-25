import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hrpzkakrvgigtxtcyjzk.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5gSsjZt69GRKBLVl-awByg_7YjJx7op'

// Authenticated client — uses Clerk JWT so RLS works per user
export const getAuthClient = (token) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth:   { persistSession: false },
})
