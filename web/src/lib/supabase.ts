import { createClient } from '@supabase/supabase-js'

const env = import.meta.env

// Defaults are the local stack from `supabase start` (the CLI's public demo anon key).
// A deployed build must set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabaseUrl: string = env.VITE_SUPABASE_URL || LOCAL_URL

/** True only when talking to a Supabase stack on this machine. Gates the dev sign-in shortcut. */
export const isLocalSupabase = ['127.0.0.1', 'localhost'].includes(new URL(supabaseUrl).hostname)

if (env.PROD && !env.VITE_SUPABASE_URL) console.warn('VITE_SUPABASE_URL is not set; using the local Supabase stack.')

export const supabase = createClient(supabaseUrl, env.VITE_SUPABASE_ANON_KEY || LOCAL_ANON_KEY)
