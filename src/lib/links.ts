/** Cross-site links. Override via env in Vercel if the domains change. */
const MARKETING =
  process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://www.aicoachingsolutions.net";
const APP = process.env.NEXT_PUBLIC_APP_URL || "https://app.aicoachingsolutions.net";

export const LINKS = {
  marketing: MARKETING,
  pricing: `${MARKETING}/pricing`,
  about: `${MARKETING}/about`,
  contact: `${MARKETING}/contact`,
  privacy: `${MARKETING}/privacy-policy`,
  terms: `${MARKETING}/terms`,
  howWeUseAi: `${MARKETING}/how-we-use-ai`,
  disclaimer: `${MARKETING}/disclaimer`,
  login: `${APP}/login`,
};
