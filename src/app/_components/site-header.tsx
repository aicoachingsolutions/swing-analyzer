import { LINKS } from "@/lib/links";

export default function SiteHeader() {
  return (
    <header className="hdr">
      <div className="hdr__inner">
        <a className="hdr__brand" href={LINKS.marketing}>
          <span className="hdr__mark">V</span>
          <span>AI Coaching Solutions</span>
        </a>
        <nav className="hdr__nav" aria-label="Primary">
          <a href={LINKS.marketing}>Home</a>
          <a href={LINKS.pricing}>Pricing</a>
          <a className="hdr__login" href={LINKS.login}>
            Login
          </a>
        </nav>
      </div>
    </header>
  );
}
