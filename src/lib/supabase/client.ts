import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (client components / sign-in). */
export function createClient() {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    domain ? { cookieOptions: { domain } } : undefined
  );
}
