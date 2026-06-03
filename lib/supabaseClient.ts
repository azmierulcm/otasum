'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const OFP_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_OFP_BUCKET || 'ofp-uploads';

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export async function ensureSupabaseUser() {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    return { supabase, user: sessionData.session.user };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message || 'Could not start Supabase anonymous session.');
  }

  return { supabase, user: data.user };
}
