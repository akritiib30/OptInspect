import "./landing.css";
import "./sections.css";
import LandingNav from "./LandingNav";
import Hero from "./Hero";
import Walkthrough from "./Walkthrough";
import Features from "./Features";
import Demo from "./Demo";
import { Closing, Faq, Footer, Results, Ribbon } from "./Rest";

export default function Landing() {
  return (
    <div className="landing">
      <LandingNav />
      <main>
        <Hero />
        <Ribbon />
        <Walkthrough />
        <Features />
        <Demo />
        <Results />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
