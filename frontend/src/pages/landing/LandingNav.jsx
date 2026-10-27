import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Logo from "../../components/Logo";
import { useAuth } from "../../lib/auth";

const LINKS = [["Product", "#features"], ["How it works", "#how"], ["Live demo", "#demo"], ["Results", "#results"], ["FAQ", "#faq"]];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`lnav ${scrolled ? "scrolled" : ""}`}>
      <div className="container">
        <Logo />
        <nav className="lnav-links" aria-label="Sections">
          {LINKS.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div className="row tight">
          {user ? (
            <Link to="/app/dashboard" className="btn btn-primary btn-sm">Open dashboard <ArrowRight size={16} /></Link>
          ) : (
            <>
              <Link to="/signin" className="btn btn-quiet btn-sm">Sign in</Link>
              <Link to="/signup" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
