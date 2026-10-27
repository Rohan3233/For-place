// QA fixture: a realistic multi-page site served on a local port, so the
// real crawler pipeline (robots, sitemap, AEO, internal links, broken
// links, redirect chains, duplicates, images) has authentic data to audit.
import http from "node:http";
import crypto from "node:crypto";

// Explicit port — do NOT read PORT from the environment: Git Bash on
// Windows leaks a random PORT value into child processes, which would
// silently move the QA site off the port the crawler expects.
const PORT = 4599;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const nav = [
  ["/", "Home"],
  ["/services/roof-repair", "Roof Repair"],
  ["/services/roof-replacement", "Roof Replacement"],
  ["/products/gutter-guard", "Gutter Guard"],
  ["/blog/how-to-choose-a-roofer", "How to Choose a Roofer"],
  ["/blog/roof-repair-cost", "Roof Repair Cost"],
  ["/about/team", "Our Team"],
  ["/blog", "Blog"],
  ["/locations/chicago", "Chicago"],
  ["/contact", "Contact"],
].map(([href, label]) => `<a href="${href}">${label}</a>`).join(" | ");

const baseMeta = (title, desc, { noindex = false, canonical = null } = {}) =>
  `<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${ORIGIN}/img/hero.jpg">
<meta property="og:url" content="${ORIGIN}/">
<meta property="og:type" content="website">
${noindex ? '<meta name="robots" content="noindex">' : ""}
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}`;

const page = (title, desc, body, opts = {}) =>
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${baseMeta(title, desc, opts)}
</head>
<body>
<header>${nav}</header>
<main>
${body}
</main>
<footer><a href="/wp-admin/">Admin</a> · <a href="/staging/preview">Staging preview</a> · <a href="http://127.0.0.1:9/external-dead">External dead link</a></footer>
</body>
</html>`;

const routes = {};

// ---------------------------------------------------------------- home ----
routes["/"] = page(
  "Acme Roofing Co — Roof Repair, Replacement & Gutter Services",
  "Acme Roofing Co provides roof repair, replacement, and gutter services across Chicago. Free inspections, licensed contractors, 10-year workmanship warranty.",
  `
<h1>Roof Repair, Replacement & Gutter Services in Chicago</h1>
<p>Acme Roofing Co has been serving the Chicago metro area for 18 years. We handle everything from emergency leak repair to full roof replacement and seamless gutter installation.</p>
<p>Every project starts with a <a href="/contact">free inspection</a> and a written, itemized quote — no pressure, no hidden fees.</p>
<h2>Our services</h2>
<ul>
  <li><a href="/services/roof-repair">Roof repair</a> — storm damage, leaks, missing shingles</li>
  <li><a href="/services/roof-replacement">Full roof replacement</a> — asphalt, metal, tile</li>
  <li><a href="/products/gutter-guard">Gutter guard installation</a></li>
</ul>
<h2>Recently from our blog</h2>
<ul>
  <li><a href="/blog/how-to-choose-a-roofer">How to choose a roofer you can trust</a></li>
  <li><a href="/blog/roof-repair-cost">What roof repair actually costs</a></li>
  <li><a href="/blog">All roofing articles</a></li>
</ul>
<h2>Meet the team</h2>
<ul>
  <li><a href="/about/team">Our licensed roofing team</a></li>
</ul>
<h2>Frequently asked questions</h2>
<h3>How long does a roof replacement take?</h3>
<p>A typical asphalt shingle roof replacement takes 2–3 days, depending on size, weather, and complexity.</p>
<h3>Do you offer free estimates?</h3>
<p>Yes — every inspection and estimate is free, with a written quote delivered within 24 hours.</p>
<h3>Is your workmanship guaranteed?</h3>
<p>All work is backed by a 10-year workmanship warranty plus the manufacturer's material warranty.</p>
<img src="/img/hero.jpg" alt="Acme Roofing Co team replacing asphalt shingles on a Chicago home" width="600">
<img src="/img/hero-large.jpg" alt="" width="600" loading="lazy">
<img src="/img/logo.png" width="120">
`,
  { canonical: `${ORIGIN}/` }
);

// ------------------------------------------------------------ services ----
routes["/services/roof-repair"] = page(
  "Roof Services | Acme Roofing Co",
  "Emergency and scheduled roof repair in Chicago — leak detection, storm damage, shingle replacement, and flashing repairs with a 10-year workmanship warranty.",
  `
<h1>Roof Repair Services</h1>
<p>Leaks, storm damage, and missing shingles don't wait. Our repair crews are available 7 days a week, and most emergency repairs are completed within 24 hours.</p>
<h2>Common roof repairs</h2>
<ul>
  <li>Leak detection and repair</li>
  <li>Storm and wind damage</li>
  <li>Shingle and flashing replacement</li>
</ul>
<p><a href="/contact">Book a free inspection</a> or call us today.</p>
<img src="/img/logo.png" width="120">
`,
  { canonical: `${ORIGIN}/services/roof-repair` }
);

routes["/services/roof-replacement"] = page(
  "Roof Services | Acme Roofing Co",
  "Full roof replacement in Chicago — asphalt, metal, and tile systems installed by licensed contractors with a 10-year workmanship warranty.",
  `
<h1>Roof Replacement Services</h1>
<p>When repair is no longer the right call, a full replacement protects your home for decades. We install asphalt, metal, and tile systems with complete tear-off and disposal.</p>
<h2>Replacement process</h2>
<ol>
  <li>Free inspection and written quote</li>
  <li>Tear-off and deck inspection</li>
  <li>Installation and final walkthrough</li>
</ol>
<p><a href="/contact">Get your free estimate</a>.</p>
`,
  { canonical: `${ORIGIN}/services/roof-replacement` }
);

// ------------------------------------------------------------ products ----
routes["/products/gutter-guard"] = page(
  "Gutter Guard Installation | Acme Roofing Co",
  "Seamless gutters and clog-free gutter guard installation for Chicago homes — keeps debris out and water flowing away from your foundation.",
  `
<h1>Gutter Guard Installation</h1>
<p>Our micro-mesh gutter guards stop leaves and debris from clogging your gutters while letting water flow freely. Installed on existing gutters in a single visit.</p>
<h2>Why homeowners choose our gutter guards</h2>
<ul>
  <li>Micro-mesh design that sheds debris</li>
  <li>Lifetime product warranty</li>
  <li>Seamless gutter installation available</li>
</ul>
<p><a href="/contact">Request a quote</a>.</p>
`,
  { canonical: `${ORIGIN}/products/gutter-guard` }
);

routes["/products/asphalt-shingles"] = page(
  "Asphalt Shingles | Acme Roofing Co",
  "Architectural asphalt shingles from top manufacturers — 30-year rated, wind-resistant, available in dozens of colors.",
  `
<h1>Asphalt Shingles</h1>
<p>We install architectural asphalt shingles with 30-year ratings.</p>
<p><a href="/contact">Ask about shingle colors</a>.</p>
`,
  { canonical: `${ORIGIN}/products/asphalt-shingles` }
);

// ---------------------------------------------------------------- blog ----
routes["/blog/how-to-choose-a-roofer"] = page(
  "How to Choose a Roofer You Can Trust | Acme Roofing Co",
  "Choosing a roofer is about more than price. Learn the license, insurance, warranty, and review checks that separate professionals from storm-chasers.",
  `
<h1>How to Choose a Roofer You Can Trust</h1>
<p>Your roof is one of the largest investments you'll make as a homeowner. Choosing the right contractor is about more than the lowest bid — it's about license, insurance, warranties, and track record.</p>
<h2>Check the license and insurance</h2>
<p>Every contractor you consider should carry a current state license, general liability insurance, and workers' compensation. Ask for certificates and verify them directly.</p>
<h2>Get a written, itemized estimate</h2>
<p>A professional roofer provides a written estimate covering materials, labor, disposal, and timelines. Be wary of anyone who only gives verbal pricing.</p>
<h2>Ask about warranties</h2>
<p>There are two warranties to confirm: the manufacturer's material warranty and the contractor's workmanship warranty. Both should be in writing.</p>
<h2>Check reviews and references</h2>
<p>Look beyond the star rating — read how a company handled problems. A strong contractor has recent, verifiable local references.</p>
<h3>How do I verify a roofer's license in Illinois?</h3>
<p>Illinois requires roofers to hold a roofing contractor license issued by the state's Department of Financial and Professional Regulation. You can look up any license number online.</p>
`,
  { canonical: `${ORIGIN}/blog/how-to-choose-a-roofer` }
);

routes["/blog/roof-repair-cost"] = page(
  "What Roof Repair Actually Costs | Acme Roofing Co",
  "Choosing a roofer is about more than price. Learn the license, insurance, warranty, and review checks that separate professionals from storm-chasers.",
  `
<h2>What roof repair actually costs</h2>
<p>Roof repair prices vary with the type of damage, the size of the repair, and the materials involved. Here's what typical Chicago-area repairs run.</p>
<h2>Minor repairs</h2>
<p>Small fixes — a few shingles, flashing, or a vent boot — typically run $250 to $600 depending on access and materials.</p>
<h2>Moderate repairs</h2>
<p>Leak repairs that require opening the roof deck usually run $600 to $1,500.</p>
<h2>When repair isn't enough</h2>
<p>If shingles are curling, granule loss is heavy, or the deck is sagging, replacement is usually the more cost-effective long-term choice. A free inspection will tell you which you need.</p>
`,
  { canonical: `${ORIGIN}/blog/roof-repair-cost` }
);

// --------------------------------------------------- locations / contact --
routes["/locations/chicago"] = page(
  "Roofing Services in Chicago, IL | Acme Roofing Co",
  "Acme Roofing Co serves all of Chicago — roof repair, replacement, and gutters across every neighborhood. Licensed, insured, and locally owned.",
  `
<h1>Roofing Services in Chicago</h1>
<p>Acme Roofing Co is a locally owned and operated roofing company serving Chicago and the surrounding suburbs.</p>
<h2>Neighborhoods we serve</h2>
<ul>
  <li>Lincoln Park, Lakeview, Wrigleyville</li>
  <li>Bucktown, Wicker Park, Logan Square</li>
  <li>Bridgeport, McKinley Park, Beverly</li>
</ul>
<p>Address: 2100 W Diversey Pkwy, Chicago, IL 60647 · Phone: (773) 555-0148</p>
`,
  { canonical: `${ORIGIN}/locations/chicago` }
);

routes["/locations/north-side"] = page(
  "Roofing Services on Chicago's North Side | Acme Roofing Co",
  "North Side Chicago roof repair and replacement from Acme Roofing Co — fast response, licensed crews, free estimates.",
  `
<h1>North Side Roofing Services</h1>
<p>Serving the North Side — from Andersonville to Uptown — with the same licensed crews and warranty coverage as the rest of Chicago.</p>
`,
  { canonical: `${ORIGIN}/locations/north-side` }
);

routes["/contact"] = page(
  "Contact Acme Roofing Co — Free Inspections in Chicago",
  "Book a free roof inspection in Chicago. Call (773) 555-0148 or use the form — we respond within one business day.",
  `
<h1>Contact Us</h1>
<p>Ready for a free inspection? Call <strong>(773) 555-0148</strong> or send us a message and we'll respond within one business day.</p>
<p>Hours: Mon–Sat, 7am–7pm</p>
<form>
  <label>Name <input type="text"></label>
  <label>Email <input type="email"></label>
  <label>Message <textarea></textarea></label>
  <button type="submit">Send</button>
</form>
`,
  { canonical: `${ORIGIN}/contact` }
);

routes["/thank-you"] = page(
  "Thank You | Acme Roofing Co",
  "Thanks for contacting Acme Roofing Co — we'll be in touch within one business day.",
  `<h1>Thanks for reaching out</h1><p>We'll be in touch within one business day.</p>`,
  { noindex: true, canonical: `${ORIGIN}/thank-you` }
);

// ---------------------------------------------- team directory (long URLs) --
// Member pages carry long URLs (like the real client site) and are linked
// only from the team index — each gets exactly one inbound link, which makes
// them "weakly connected" and reproduces the dense internal-linking page.
const TEAM_MEMBERS = [
  "advocate-nirwan-jung-karki",
  "advocate-ashika-chapagain",
  "advocate-nirab-gyawali",
  "advocate-prajwol-bickram-rana",
  "ca-santosh-pokharel",
  "kailash-khanal",
  "rosy-shrestha",
  "suman-dhungala",
  "advocate-rita-sharma",
  "advocate-suresh-thapa",
  "ca-anita-gurung",
  "bibek-lama",
  "advocate-kamal-rai",
  "nisha-tamang",
];

routes["/about/team"] = page(
  "Our Team | Acme Roofing Co",
  "Meet the licensed roofers, estimators, and customer-care team behind Acme Roofing Co's Chicago operations.",
  `<h1>Our Team</h1>
<p>Every project is backed by licensed, experienced professionals.</p>
<ul>
${TEAM_MEMBERS.map(
  (slug) =>
    `  <li><a href="/about/team/${slug}">${slug.replace(/-/g, " ")}</a></li>`
).join("\n")}
</ul>
<p><a href="/contact">Work with our team</a></p>`,
  { canonical: `${ORIGIN}/about/team` }
);

for (const slug of TEAM_MEMBERS) {
  const name = slug.replace(/-/g, " ");
  routes[`/about/team/${slug}`] = page(
    `${name} — Roofing Professional | Acme Roofing Co`,
    `${name} is part of the licensed roofing team at Acme Roofing Co in Chicago.`, 
    `<h1>${name}</h1>
<p>${name} is a member of the Acme Roofing Co team serving the greater Chicago area.</p>
<p>Specializes in residential roofing, storm response, and customer care.</p>`,
    { canonical: `${ORIGIN}/about/team/${slug}` }
  );
}

// More blog posts — each linked only from the blog index below, so they also
// register as weakly connected pages and grow the internal-link section.
const EXTRA_BLOG = [
  "roof-ventilation-guide",
  "metal-roofing-vs-shingles",
  "storm-damage-checklist",
  "flat-roof-repair",
  "gutter-cleaning-frequency",
  "roof-insurance-claims",
  "skylight-installation",
  "ice-dam-prevention",
  "roof-life-expectancy",
  "attic-insulation-tips",
  "snow-removal-roofs",
  "roof-flashing-repair",
];

routes["/blog"] = page(
  "Roofing Blog | Acme Roofing Co",
  "Practical roofing advice from Acme Roofing Co — maintenance, costs, materials, and storm response.",
  `<h1>Roofing Blog</h1>
<ul>
${EXTRA_BLOG.map(
  (slug) => `  <li><a href="/blog/${slug}">${slug.replace(/-/g, " ")}</a></li>`
).join("\n")}
</ul>
<p><a href="/blog/how-to-choose-a-roofer">How to choose a roofer</a></p>`,
  { canonical: `${ORIGIN}/blog` }
);

for (const slug of EXTRA_BLOG) {
  const title = slug.replace(/-/g, " ");
  routes[`/blog/${slug}`] = page(
    `${title} | Acme Roofing Co Blog`,
    `${title} — practical guidance from the Acme Roofing Co team in Chicago.`,
    `<h1>${title}</h1>
<p>Practical roofing guidance from the Acme Roofing Co team in Chicago.</p>
<h2>Why this matters</h2>
<p>Small roofing decisions compound over time. Knowing the trade-offs before you spend keeps your roof healthy and your budget predictable.</p>
<p><a href="/contact">Talk to a licensed roofer</a></p>`,
    { canonical: `${ORIGIN}/blog/${slug}` }
  );
}

// ------------------------------------------------------- redirect chains --
routes["/chain-a"] = null; // 301
routes["/chain-b"] = null; // 301
routes["/chain-c"] = null; // 200 target below
routes["/old-page"] = null; // 301 single hop
routes["/missing"] = null; // 404
routes["/dead-link"] = null; // 404

const CHAIN_C = page(
  "Roofing Maintenance Guide | Acme Roofing Co",
  "Seasonal roofing maintenance checklist — what to inspect, when, and how to spot small problems before they become expensive repairs.",
  `
<h1>Roofing Maintenance Guide</h1>
<p>Most roof failures start small: a lifted shingle, a cracked boot, a clogged valley. A short seasonal checklist catches them early.</p>
<h2>Spring</h2>
<p>Inspect for winter damage, clean gutters, and check flashing around chimneys and skylights.</p>
<h2>Fall</h2>
<p>Clear debris, trim overhanging branches, and verify attic ventilation before heating season.</p>
`
);

// ------------------------------------------------------------ robots.txt --
const robots = `User-agent: *
Allow: /
Disallow: /wp-admin/
Disallow: /staging/

User-agent: GPTBot
Disallow: /private-ai/

Sitemap: ${ORIGIN}/sitemap.xml
`;

// ---------------------------------------------------------- sitemap.xml ----
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/</loc></url>
  <url><loc>${ORIGIN}/services/roof-repair</loc></url>
  <url><loc>${ORIGIN}/services/roof-replacement</loc></url>
  <url><loc>${ORIGIN}/products/gutter-guard</loc></url>
  <url><loc>${ORIGIN}/products/asphalt-shingles</loc></url>
  <url><loc>${ORIGIN}/blog/how-to-choose-a-roofer</loc></url>
  <url><loc>${ORIGIN}/blog/roof-repair-cost</loc></url>
  <url><loc>${ORIGIN}/blog/roofing-maintenance-guide</loc></url>
  <url><loc>${ORIGIN}/locations/chicago</loc></url>
  <url><loc>${ORIGIN}/locations/north-side</loc></url>
  <url><loc>${ORIGIN}/contact</loc></url>
  <url><loc>${ORIGIN}/thank-you</loc></url>
  <url><loc>${ORIGIN}/about/team</loc></url>
  <url><loc>${ORIGIN}/blog</loc></url>
  ${TEAM_MEMBERS.map((s) => `<url><loc>${ORIGIN}/about/team/${s}</loc></url>`).join("\n  ")}
  ${EXTRA_BLOG.map((s) => `<url><loc>${ORIGIN}/blog/${s}</loc></url>`).join("\n  ")}
</urlset>
`;

// --------------------------------------------------------------- images ----
const SVG_LOGO = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#1D6FD8"/><text x="8" y="26" fill="#fff" font-size="16">ACME</text></svg>`
);
const HERO_JPG = Buffer.alloc(180 * 1024, 7); // ~180KB random-ish body, no alt
const HERO_LARGE = Buffer.alloc(320 * 1024, 9); // >200KB -> oversized image
const HTML = {
  "text/html; charset=utf-8": (r) => r,
  "text/plain; charset=utf-8": (r) => r,
  "application/xml": (r) => r,
  "image/svg+xml": () => SVG_LOGO,
  "image/jpeg": (r) => r,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  const path = url.pathname;

  if (path === "/robots.txt") return send(res, 200, "text/plain; charset=utf-8", robots);
  if (path === "/sitemap.xml") return send(res, 200, "application/xml", sitemap);
  if (path === "/llms.txt") return send(res, 200, "text/plain; charset=utf-8", "Acme Roofing Co\n> Roof repair, replacement, and gutter services in Chicago.\n\n[Home](http://127.0.0.1:4599/)\n[Roof Repair](http://127.0.0.1:4599/services/roof-repair)\n[Contact](http://127.0.0.1:4599/contact)\n");
  if (path === "/img/logo.png") return send(res, 200, "image/png", SVG_LOGO);
  if (path === "/img/hero.jpg") return send(res, 200, "image/jpeg", HERO_JPG);
  if (path === "/img/hero-large.jpg") return send(res, 200, "image/jpeg", HERO_LARGE);

  if (path === "/chain-a") return send(res, 301, "text/plain; charset=utf-8", "Moved", { Location: "/chain-b" });
  if (path === "/chain-b") return send(res, 301, "text/plain; charset=utf-8", "Moved", { Location: "/chain-c" });
  if (path === "/chain-c") return send(res, 200, "text/html; charset=utf-8", CHAIN_C);
  if (path === "/old-page") return send(res, 301, "text/plain; charset=utf-8", "Moved", { Location: "/services/roof-repair" });
  if (path === "/missing") return send(res, 404, "text/plain; charset=utf-8", "Not found");
  if (path === "/dead-link") return send(res, 404, "text/plain; charset=utf-8", "Not found");

  const body = routes[path];
  if (body === undefined) return send(res, 404, "text/plain; charset=utf-8", "Not found");
  if (body === null) return send(res, 404, "text/plain; charset=utf-8", "Not found");
  return send(res, 200, "text/html; charset=utf-8", body);
});

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`QA site running at ${ORIGIN}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
