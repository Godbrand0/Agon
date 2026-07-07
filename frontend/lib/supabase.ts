import { createClient } from "@supabase/supabase-js";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!rawUrl || !rawAnon) {
  console.warn(
    "⚠️ Supabase environment variables are missing. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file."
  );
}

const url = rawUrl || "https://placeholder-project.supabase.co";
const anon = rawAnon || "placeholder-anon-key";

// Browser-safe singleton
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(url, anon);

// Server-side client with elevated privileges (API routes only).
// Singleton: createClient() spins up a GoTrueClient with an auto-refresh
// timer that's never torn down, so calling this as a factory leaked one
// client (and timer) per call — fatal in the long-running scheduler worker,
// which calls it dozens of times a minute.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAdmin() {
  if (_adminClient) return _adminClient;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
  _adminClient = createClient<any>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _adminClient;
}

