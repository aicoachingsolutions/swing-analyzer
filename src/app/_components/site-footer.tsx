import { LINKS } from "@/lib/links";

export default function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="ftr__inner">
        <div className="ftr__brand">
          <span className="hdr__mark">V</span>
          <span>AI Coaching Solutions</span>
        </div>
        <nav className="ftr__legal" aria-label="Legal">
          <a href={LINKS.privacy}>Privacy</a>
          <a href={LINKS.terms}>Terms</a>
          <a href={LINKS.howWeUseAi}>How We Use AI</a>
          <a href={LINKS.disclaimer}>Disclaimer</a>
          <a href={LINKS.contact}>Contact</a>
        </nav>
      </div>
      <p className="ftr__note">
        Some features use AI to generate suggestions and feedback. Coaches stay in
        control of every decision.
      </p>
      <p className="ftr__copy">
        &copy; {new Date().getFullYear()} AI Coaching Solutions. All rights reserved.
      </p>
    </footer>
  );
}
