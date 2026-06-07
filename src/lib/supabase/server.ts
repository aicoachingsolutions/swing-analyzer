import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/**
 * SSR Supabase client bound to the request cookies. Carries the user's
 * session, so this is how we identify the logged-in coach.
 *
 * The cookie `domain` is set to NEXT_PUBLIC_COOKIE_DOMAIN (e.g.
 * `.aicoachingsolutions.net`) so a session created on the practice planner
 * is shared with this analyzer subdomain — one login across the platform.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            });
          });
        },
      },
    }
  );
}
