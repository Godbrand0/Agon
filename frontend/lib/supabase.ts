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

// Server-side client with elevated privileges (API routes only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAdmin() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
  return createClient<any>(url, serviceRole, {
    auth: { persistSession: false },
  });
}

