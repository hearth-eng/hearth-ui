/* =========================================================================
 HEARTH — layout.js
 Single source of truth for the site chrome (top nav header + footer),
 previously copy-pasted (with drift) into every page's <header
 class="site-header">...</header> and <footer class="site-footer">...
 </footer> blocks. Each page now just leaves empty
 <div id="siteHeaderSlot"></div> / <div id="siteFooterSlot"></div>
 placeholders where those used to be; this file builds the real markup
 and drops it in, working out page-specific bits (active nav link,
 "#top" vs "index.html#top", the footer's id="contact" anchor) purely
 from the current page's URL — no per-page configuration needed.

 IMPORTANT: this must run — and finish injecting the header — before
 script.js's DOMContentLoaded handler, since initStickyHeader()/
 initMobileNav() there grab #siteHeader/#navToggle/#navLinks directly.
 So this file:
   (a) must be the first <script src="..."> tag on the page (before
       api.js and script.js), and
   (b) injects immediately at parse time rather than waiting for
       DOMContentLoaded — by the time this tag runs, the rest of the
       body (including the slot divs) is already parsed since scripts
       are loaded at the end of <body>.
 ========================================================================= */

/** The primary nav, in display order. `file` is what's matched against the
 *  current page to decide the active link and (for "Home") the href. Links
 *  with no `file` (e.g. "Become a Professional") never get marked active —
 *  matching the original hand-written markup, where that link was always
 *  a plain call-to-action rather than a "you are here" indicator. */
const SITE_NAV_LINKS = [
    {file: 'index', label: 'Home'},
    {file: 'categories', label: 'Categories', hiddenOn: ['professional-portal']},
    {file: 'about', label: 'About Us'},
    {file: 'contact', label: 'Contact Us'},
    {file: 'faq', label: 'FAQs'},
    {file: null, href: 'professional-onboarding', label: 'Become a Professional', extraClass: 'nav-link-pro', hiddenOn: ['professional-portal']}
];

/** Returns the current page's key with no ".html" and no leading/trailing
 *  slashes, e.g. "categories" for both /categories.html and /categories -
 *  so active-link/chrome detection works the same regardless of which form
 *  a given link on the site (old or already-clean) sent the user through. */
function currentPageFile() {
    const last = window.location.pathname.split('/').pop();
    return (last ? last : 'index').replace(/\.html$/, '');
}

/** Professional-facing pages get a stripped-down chrome: just the brand
 *  (not a link) and the account chip — no site nav links, no Log In /
 *  Sign Up (those are the customer flows), and no footer. */
const PROFESSIONAL_CHROME_PAGES = ['professional-onboarding', 'professional-portal'];

function isProfessionalChromePage() {
    return PROFESSIONAL_CHROME_PAGES.includes(currentPageFile());
}

function renderProfessionalHeader() {
    return `<header class="site-header" id="siteHeader">
  <nav class="navbar" aria-label="Professional navigation">
    <span class="brand" aria-label="Hearth for Professionals">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="34" height="34">
          <path d="M20 4 L36 16 V35 H24 V24 H16 V35 H4 V16 Z" fill="currentColor"/>
          <circle cx="20" cy="16" r="2.6" fill="var(--color-cream)"/>
        </svg>
      </span>
      <span class="brand-name">Hearth</span>
      <span style="font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-clay-dark); background: var(--color-clay-10); padding: 0.25rem 0.6rem; border-radius: var(--radius-pill); margin-left: 0.2rem;">Professionals</span>
    </span>

    <!-- Filled by script.js's renderUserChip() once a session exists.
         Inline display:flex keeps the chip visible on mobile too, since
         there's no hamburger menu on these pages. -->
    <div class="nav-actions" id="navActions" style="display:flex;"></div>
  </nav>
</header>`;
}

function renderSiteHeader() {
    if (isProfessionalChromePage())
        return renderProfessionalHeader();
    const page = currentPageFile();
    const isHome = page === 'index';
    const homeHref = isHome ? '#top' : 'index#top';

    // `hiddenOn` lists pages where a link shouldn't appear at all (e.g. the
    // professional portal has no use for customer browsing / onboarding links).
    const linksHtml = SITE_NAV_LINKS
            .filter(link => !(link.hiddenOn || []).includes(page))
            .map(link => {
        const isActive = !!link.file && link.file === page;
        const cls = ['nav-link', link.extraClass, isActive ? 'is-active' : ''].filter(Boolean).join(' ');
        const href = link.file === 'index' ? homeHref : (link.href || link.file);
        return `      <li><a href="${href}" class="${cls}">${link.label}</a></li>`;
    }).join('\n');

    return `<header class="site-header" id="siteHeader">
  <nav class="navbar" aria-label="Primary navigation">
    <a href="${homeHref}" class="brand" aria-label="Hearth home">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="34" height="34">
          <path d="M20 4 L36 16 V35 H24 V24 H16 V35 H4 V16 Z" fill="currentColor"/>
          <circle cx="20" cy="16" r="2.6" fill="var(--color-cream)"/>
        </svg>
      </span>
      <span class="brand-text">
        <span class="brand-name">Hearth</span>
        <span class="brand-tagline">Home, Warmth and Care</span>
      </span>
    </a>

    <ul class="nav-links" id="navLinks">
${linksHtml}
    </ul>

    <div class="nav-actions" id="navActions">
      <a href="#login" class="btn btn-ghost" id="loginBtn">Log In</a>
      <a href="#signup" class="btn btn-primary btn-ripple" id="signupBtn">Sign Up</a>
    </div>

    <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="navLinks" aria-label="Toggle navigation menu">
      <span></span><span></span><span></span>
    </button>
  </nav>
</header>`;
}

/** Only the home page's footer carried id="contact" and the "#top"
 *  (vs. "index.html#top") brand link; nothing else in the site links to
 *  "#contact" directly today, but the id is preserved as-is since it
 *  clearly marked an intentional anchor point rather than stray markup.
 *  Every other field (Services/Legal links, newsletter copy, copyright)
 *  was already byte-identical across all 17 pages.
 *
 *  Note: on 12 of the 17 pages, the Company column's Careers/Press links
 *  were stale "#" placeholders even though careers.html/press.html both
 *  exist and are correctly linked on the other 5 (incl. index.html) —
 *  this shared template resolves that drift to the real, working hrefs. */
function renderSiteFooter() {
    const page = currentPageFile();
    const isHome = page === 'index';
    const homeHref = isHome ? '#top' : 'index#top';
    const footerIdAttr = isHome ? ' id="contact"' : '';

    return `<footer class="site-footer"${footerIdAttr}>
  <div class="footer-top section-inner">
    <div class="footer-brand">
      <a href="${homeHref}" class="brand brand-footer" aria-label="Hearth home">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="30" height="30"><path d="M20 4 L36 16 V35 H24 V24 H16 V35 H4 V16 Z" fill="currentColor"/><circle cx="20" cy="16" r="2.6" fill="var(--color-espresso)"/></svg>
        </span>
        <span class="brand-text">
          <span class="brand-name">Hearth</span>
          <span class="brand-tagline">Home, Warmth and Care</span>
        </span>
      </a>
      <p>Trusted home services, booked in minutes. Verified pros, upfront pricing, guaranteed work.</p>
      <div class="social-links" aria-label="Hearth on social media">
        <a href="#" aria-label="Hearth on Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
        <a href="#" aria-label="Hearth on X"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3l7.5 9.5L3.4 21H6l5.8-6.8L16.5 21H21l-8-10.1L20.6 3H18l-5.3 6.2L8.5 3H3z"/></svg></a>
        <a href="#" aria-label="Hearth on LinkedIn"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM9.5 9H13v1.7c.6-1 1.9-2 3.9-2 3.3 0 4.6 2.1 4.6 5.6V21H17v-6.1c0-1.6-.6-2.7-2-2.7-1.1 0-1.7.8-2 1.5-.1.3-.1.6-.1 1V21H9.5Z"/></svg></a>
      </div>
    </div>

    <nav class="footer-col" aria-label="Company">
      <h4>Company</h4>
      <ul>
        <li><a href="about">About Us</a></li>
        <li><a href="careers">Careers</a></li>
        <li><a href="press">Press</a></li>
        <li><a href="contact">Contact Us</a></li>
      </ul>
    </nav>

    <nav class="footer-col" aria-label="Services">
      <h4>Services</h4>
      <ul>
        <li><a href="categories#cleaning-pest-control">Home Cleaning</a></li>
        <li><a href="categories#salon-makeup">Salon at Home</a></li>
        <li><a href="categories#appliance-repair">AC Repair</a></li>
        <li><a href="categories#electrician-plumbing-carpentry">Electrician</a></li>
        <li><a href="categories#electrician-plumbing-carpentry">Plumbing</a></li>
      </ul>
    </nav>

    <nav class="footer-col" aria-label="Legal">
      <h4>Legal</h4>
      <ul>
        <li><a href="terms">Terms of Service</a></li>
        <li><a href="privacy">Privacy Policy</a></li>
        <li><a href="refund">Refund Policy</a></li>
        <li><a href="faq">FAQs</a></li>
      </ul>
    </nav>

    <div class="footer-col footer-newsletter">
      <h4>Stay in the loop</h4>
      <p>Offers and service tips, once a month — no spam.</p>
      <form class="newsletter-form" aria-label="Subscribe to newsletter">
        <label for="newsletterEmail" class="visually-hidden">Email address</label>
        <input type="email" id="newsletterEmail" placeholder="you@email.com" required>
        <button type="submit" class="btn btn-primary btn-sm btn-ripple">Subscribe</button>
      </form>
    </div>
  </div>

  <div class="footer-bottom section-inner">
    <p>&copy; 2026 Hearth Technologies Pvt. Ltd. All rights reserved.</p>
    <p>Made with care, for homes everywhere.</p>
  </div>
</footer>`;
}

(function injectSiteHeader() {
    const slot = document.getElementById('siteHeaderSlot');
    if (!slot)
        return; // page doesn't use the shared header (or already has its own)
    slot.outerHTML = renderSiteHeader();
})();

(function injectSiteFooter() {
    const slot = document.getElementById('siteFooterSlot');
    if (!slot)
        return; // page doesn't use the shared footer (or already has its own)
    if (isProfessionalChromePage()) {
        slot.remove(); // professional pages have no footer
        return;
    }
    slot.outerHTML = renderSiteFooter();
})();
