import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export function createCustomerSupabaseClient() {
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
    },
  });
}
