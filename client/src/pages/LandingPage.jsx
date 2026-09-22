import { CareerMatchSection } from '../components/landing/CareerMatchSection.jsx';
import { CareerTwinSection } from '../components/landing/CareerTwinSection.jsx';
import { EvidenceSection } from '../components/landing/EvidenceSection.jsx';
import { FinalCTA } from '../components/landing/FinalCTA.jsx';
import { HeroSection } from '../components/landing/HeroSection.jsx';
import { LandingFooter } from '../components/landing/LandingFooter.jsx';
import { LandingNavbar } from '../components/landing/LandingNavbar.jsx';
import { ProblemSection } from '../components/landing/ProblemSection.jsx';
import { ProductLoop } from '../components/landing/ProductLoop.jsx';
import { ProductPreview } from '../components/landing/ProductPreview.jsx';
import { ReadinessSection } from '../components/landing/ReadinessSection.jsx';
import { RoadmapSection } from '../components/landing/RoadmapSection.jsx';
import { SkillGapSection } from '../components/landing/SkillGapSection.jsx';
import { WhyNexora } from '../components/landing/WhyNexora.jsx';

import '../components/landing/landing.css';

/**
 * `/` — the public landing page.
 *
 * Composition only. Each section owns its own content and its own motion, so
 * this file stays readable as the running order of the story:
 *
 * ```text
 * the promise            hero
 *   → the problem        scattered information, three unanswered questions
 *   → the model          CareerTwin
 *   → the distinction    claimed / supported / verified
 *   → the direction      explainable matching against a real catalogue
 *   → the shortfall      skill gap
 *   → the plan           roadmap
 *   → the engine         the whole loop, with what is and is not built
 *   → the outcome        readiness as evidence, not a score
 *   → the product        dashboard preview
 *   → the argument       why Nexora
 *   → the ask            final CTA
 * ```
 *
 * The loop sits after the individual stages rather than before them: it is
 * the payoff of having understood each one, and the navbar and the hero's
 * secondary action both link straight to it for anyone who wants it first.
 *
 * `<main>` carries the skip link's target. The document has exactly one `h1`
 * — the hero — and every section below is an `h2`, so the outline a screen
 * reader builds is the running order above.
 */
export function LandingPage() {
  return (
    <>
      <LandingNavbar />

      <main id="main-content">
        <HeroSection />
        <ProblemSection />
        <CareerTwinSection />
        <EvidenceSection />
        <CareerMatchSection />
        <SkillGapSection />
        <RoadmapSection />
        <ProductLoop />
        <ReadinessSection />
        <ProductPreview />
        <WhyNexora />
        <FinalCTA />
      </main>

      <LandingFooter />
    </>
  );
}
