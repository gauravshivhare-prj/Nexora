import { Link } from 'react-router-dom';

/**
 * The footer.
 *
 * Only destinations that exist: the page's own sections, and the two doors
 * into the product. No social links, no "company" column and no newsletter —
 * a footer full of links to nothing is the clearest possible signal that a
 * product page is a template.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-orange-100 bg-canvas px-5 py-12 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-base font-bold tracking-[0.18em] text-ink uppercase">Nexora</p>
          <p className="mt-2 max-w-xs text-sm text-ink-muted">
            From student profile to career-ready candidate.
          </p>
        </div>

        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="text-xs font-semibold tracking-[0.18em] text-ink uppercase">
            Product
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {[
              ['How it works', '#how-it-works'],
              ['CareerTwin', '#career-twin'],
              ['Evidence', '#evidence'],
              ['Roadmap', '#roadmap'],
            ].map(([label, href]) => (
              <li key={href}>
                <a
                  href={href}
                  className="text-ink-muted transition-colors duration-200 hover:text-brand-text"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-account">
          <h2 id="footer-account" className="text-xs font-semibold tracking-[0.18em] text-ink uppercase">
            Account
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link
                to="/register"
                className="text-ink-muted transition-colors duration-200 hover:text-brand-text"
              >
                Create account
              </Link>
            </li>
            <li>
              <Link
                to="/login"
                className="text-ink-muted transition-colors duration-200 hover:text-brand-text"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-10 w-full max-w-6xl border-t border-orange-100 pt-6">
        <p className="text-xs text-ink-muted">
          Assessments, AI interviews, career readiness and opportunity matching are fully integrated in Nexora. Every stage of
          the loop on this page is labelled with whether it is available today.
        </p>
      </div>
    </footer>
  );
}
