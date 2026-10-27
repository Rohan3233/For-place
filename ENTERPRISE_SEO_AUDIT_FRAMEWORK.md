# Enterprise Three-Pillar SEO & AI Search Readiness Audit Framework
## Standalone Deliverable — Version 3.0 | Enterprise Edition

---

> **Purpose:** This framework provides a complete, implementation-ready audit covering Traditional SEO (On-Page + Technical) and the emerging discipline of AI Search Engine Optimization (AEO/GEO). Every finding is classified, contextualized with business impact, and paired with executable fix templates and binary verification checkpoints. Designed for mid-market to enterprise stakeholders requiring zero ambiguity.

---

# TABLE OF CONTENTS

1. **PILLAR 1: ON-PAGE SEO AUDIT**
   - 1.1 Title Tag Analysis
   - 1.2 Meta Description Analysis
   - 1.3 Heading Tag Hierarchy Audit
   - 1.4 Content Optimization & Thin Content Analysis
   - 1.5 Image Optimization (Filename & Alt Text)

2. **PILLAR 2: TECHNICAL SEO AUDIT**
   - 2.1 Indexability Parameters (Canonical, Noindex, Robots)
   - 2.2 Crawl Health (Broken Links, Internal Link Coverage, Sitemaps)
   - 2.3 URL Architecture & Clean Routing
   - 2.4 Core Web Vitals Lab Data Mapping
   - 2.5 Diagnostic Disclaimers & Override Logic

3. **PILLAR 3: AI SEARCH READINESS (AEO/GEO)**
   - 3.1 Structured Data Entity Audit (JSON-LD Schema)
   - 3.2 Informational Scraping Density Analysis
   - 3.3 Factual Authority & Brand Entity Footprint
   - 3.4 LLM Crawler Accessibility & Content Formatting

---

# EXECUTIVE SUMMARY TEMPLATE

---

> **[COMPANY NAME] — SEO & AI Search Readiness Audit**
>
> **Date:** [AUDIT DATE]
> **Auditor:** [FIRM / CONSULTANT NAME]
> **Scope:** [URL COUNT] URLs audited across [NUMBER] page templates
>
> **Overall Health Score:** [X / 100]
>
> | Pillar | Score | Critical | Warning | Info |
> |--------|-------|----------|---------|------|
> | On-Page SEO | X/100 | X | X | X |
> | Technical SEO | X/100 | X | X | X |
> | AI Search Readiness | X/100 | X | X | X |
>
> **Top 3 Revenue-Risk Findings:**
> 1. [FINDING] — Estimated impact: [METRIC]
> 2. [FINDING] — Estimated impact: [METRIC]
> 3. [FINDING] — Estimated impact: [METRIC]

---

# PILLAR 1: ON-PAGE SEO AUDIT

---

## 1.1 TITLE TAG ANALYSIS

### Audit Framework

| Metric | Ideal Range | Tolerance | Severity If Violated |
|--------|-------------|-----------|---------------------|
| Character Count | 50–60 characters | ±5 chars acceptable | Warning at 60+, Critical at 70+ |
| Pixel Width | ≤580px | ±20px | Truncation in SERP display |
| Primary Keyword Placement | First 30 characters | — | Ranking signal dilution |
| Uniqueness | 100% unique per URL | — | Duplicate Content signal |
| Brand Suffix Convention | Brand at end or absent | — | Consistency violation |

### Scoring Matrix

| Score | Criteria |
|-------|----------|
| **10/10** | All titles 50–60 chars, unique, keyword-frontloaded, brand-consistent, no truncation in SERP |
| **8–9/10** | Minor deviations: 1–2 titles slightly over 60 chars; brand placement inconsistent on ≤20% of pages |
| **6–7/10** | Systemic issues: templated titles exceeding 70 chars, keyword buried, duplicates detected |
| **4–5/10** | Widespread duplication, missing titles, or auto-generated gibberish |
| **1–3/10** | 50%+ titles missing, duplicated across sections, or no keyword targeting whatsoever |

### Finding Template

```
┌─────────────────────────────────────────────────────────┐
│ FINDING: [TITLE TAG ISSUE TYPE]                        │
│ SEVERITY: Critical / Warning / Info                    │
│ AFFECTED URLS: [COUNT] ([PERCENTAGE]% of audited URLs) │
│                                                         │
│ Current Value: "[EXACT CURRENT TITLE TEXT]"            │
│ Character Count: [X] chars / ~[X]px                   │
│ Target Range: 50–60 chars / ≤580px                     │
│                                                         │
│ WHY IT MATTERS:                                        │
│ [2-3 sentence explanation of how this impacts           │
│  click-through rate, SERP real estate, and ranking      │
│  signal clarity. Reference specific CTR data from       │
│  Backlinko/First Page Sage CTR studies where applicable]│
│                                                         │
│ BUSINESS IMPACT:                                       │
│ [Executive-level translation: estimated traffic loss,   │
│  revenue implication, competitive visibility risk]     │
│                                                         │
│ RECOMMENDED FIX:                                       │
│ [Specific instructions with before/after examples]     │
│                                                         │
│ HOW TO VERIFY THIS FIX:                                │
│ □ Step 1: [Specific verification action]               │
│ □ Step 2: [Specific verification action]               │
│ □ Step 3: [Confirmation criteria]                      │
└─────────────────────────────────────────────────────────┘
```

### Reference Code Block — Title Tag Template

```html
<!-- OPTIMAL TITLE TAG FORMAT -->
<title>[Primary Keyword] — [Secondary Modifier] | [Brand Name]</title>

<!-- EXAMPLES BY PAGE TYPE -->

<!-- Homepage -->
<title>Enterprise Cloud Backup Solutions — SOC 2 Compliant | Acme Corp</title>
<!-- 60 chars | Keyword-first | Brand suffix -->

<!-- Product Page -->
<title>Acme Shield Pro — Automated Threat Detection Platform | Acme Corp</title>
<!-- 66 chars | Product name + modifier | Acceptable minor truncation -->

<!-- Blog Post -->
<title>How to Reduce Ransomware Risk by 73% in 2026 | Acme Corp</title>
<!-- 58 chars | Number + qualifier for CTR optimization -->

<!-- Location Page -->
<title>Managed IT Services in Austin, TX — 24/7 Support | Acme Corp</title>
<!-- 63 chars | Geo-modified | Slight truncation acceptable for local intent -->

<!-- CATEGORY / PILLAR PAGE -->
<title>Cloud Security Guide: Architecture, Compliance & Best Practices</title>
<!-- 65 chars | Colon delimiter for topic cluster hierarchy -->
```

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | HTML Source Inspection | Right-click → View Page Source → Search `<title>` | Exact match with documented fix |
| 2 | Google SERP Verification | Site: operator search → check displayed titles | No unexpected truncation beyond brand suffix |
| 3 | Screaming Frog Re-crawl | Post-fix crawl → Exports → Title Length column | 100% of URLs within 50–60 char range |
| 4 | Google Search Console | Performance → Pages → check title match warnings | Zero "Duplicate title tags" or "Title too long" issues |

---

## 1.2 META DESCRIPTION ANALYSIS

### Audit Framework

| Metric | Ideal Range | Tolerance | Severity If Violated |
|--------|-------------|-----------|---------------------|
| Character Count | 120–160 characters | ±10 chars | Warning at 160+, Critical at 170+ |
| Keyword Inclusion | Primary + action keyword | — | Low CTR, auto-generated by Google |
| Uniqueness | 100% unique per URL | — | Duplicate content signal |
| Call-to-Action Presence | At least one CTA phrase | — | Low conversion from SERP |
| Blank/Absent Rate | 0% | — | Critical: Google auto-generates (~70% chance of poor match) |

### CTR Impact Reference Data

| Position | Average CTR (No Meta Description) | Average CTR (Optimized Description) | Delta |
|----------|-----------------------------------|--------------------------------------|-------|
| 1 | ~27.6% | ~31.2% | +3.6pp |
| 2 | ~15.8% | ~18.1% | +2.3pp |
| 3 | ~11.0% | ~13.4% | +2.4pp |
| 4–6 | ~6–8% | ~8–10% | +1.5–2pp |

> *Source: First Page Sage CTR Study, 2024; Backlinko SERP CTR Analysis*

### Reference Code Block — Meta Description Template

```html
<!-- OPTIMAL META DESCRIPTION FORMAT -->
<meta name="description" content="[PRIMARY KEYWORD CONTEXT] — [VALUE PROPOSITION] [CTA]. [SUPPORTING DETAIL ≤160 CHARS TOTAL]">

<!-- EXAMPLES BY PAGE TYPE -->

<!-- Homepage -->
<meta name="description" content="Acme Corp delivers SOC 2–compliant cloud backup for enterprises. Reduce ransomware risk by 73%. Request a free security assessment today.">
<!-- 149 chars | Value prop + statistic + CTA -->

<!-- Product Page -->
<meta name="description" content="Acme Shield Pro provides real-time automated threat detection across hybrid clouds. Deploy in 15 minutes. Start your 30-day free trial.">
<!-- 142 chars | Feature + speed claim + CTA -->

<!-- Blog Post -->
<meta name="description" content="Learn the 5-step framework IT leaders use to cut ransomware exposure by 73% — with ROI templates and compliance checklists you can implement today.">
<!-- 151 chars | Number + audience qualifier + content promise -->

<!-- Location Page -->
<meta name="description" content="Acme Corp provides 24/7 managed IT services in Austin, TX. Trusted by 200+ local businesses. Schedule your free infrastructure review.">
<!-- 140 chars | Geo-modified + social proof + CTA -->

<!-- FAQ / Support Page -->
<meta name="description" content="Answers to the 12 most common questions about Acme Shield Pro setup, pricing, SLA terms, and integration with AWS, Azure, and GCP environments.">
<!-- 150 chars | Count signal + scope coverage -->
```

### Finding Template — Meta Description

```
┌─────────────────────────────────────────────────────────┐
│ FINDING: [META DESCRIPTION ISSUE TYPE]                  │
│ SEVERITY: Critical / Warning / Info                    │
│ AFFECTED URLS: [COUNT] ([PERCENTAGE]%)                 │
│                                                         │
│ Current Value: "[EXACT META DESCRIPTION]"              │
│ Character Count: [X] chars                             │
│ Target Range: 120–160 chars                            │
│ Has CTA: [YES/NO]                                      │
│ Has Keyword: [YES/NO]                                  │
│                                                         │
│ WHY IT MATTERS:                                        │
│ Google rewrites meta descriptions for ~63–70% of        │
│ search queries (Moz, 2024). When your description       │
│ is missing, duplicated, or poorly targeted, Google       │
│ constructs one from body content — often pulling        │
│ irrelevant fragments that suppress CTR by 15–30%       │
│ compared to handcrafted alternatives.                   │
│                                                         │
│ BUSINESS IMPACT:                                       │
│ A 20% CTR reduction on a page ranking position 3        │
│ with 10,000 monthly impressions represents ~200         │
│ fewer clicks/month. At a $50 CPA, that's $10,000/mo    │
│ in lost pipeline across affected pages.                 │
│                                                         │
│ RECOMMENDED FIX:                                       │
│ [Specific rewrite template with before/after]           │
│                                                         │
│ HOW TO VERIFY THIS FIX:                                │
│ □ Inspect <meta name="description"> in View Source      │
│ □ Confirm character count via screaming frog export      │
│ □ Verify SERP display after Google re-crawl (7–14 days) │
│ □ Check GSC → Enhancements → HTML improvements          │
└─────────────────────────────────────────────────────────┘
```

---

## 1.3 HEADING TAG HIERARCHY AUDIT

### Audit Framework

| Metric | Requirement | Severity If Violated |
|--------|-------------|---------------------|
| Single H1 per page | Exactly 1 `<h1>` tag | Critical (duplicate or missing H1) |
| H1 contains primary keyword | First ~60 chars of H1 | Warning |
| H1–H2–H3 nesting | Strict hierarchical order (no skipped levels) | Warning |
| H2 count per page | 2–8 depending on content depth | Info |
| H3+ usage | Subtopic decomposition within H2 sections | Info |
| Heading uniqueness per page | No duplicate H2/H3 strings on same page | Warning |
| Heading as visual styling only | `<h2>` used purely for CSS bolding | Critical (semantic violation) |

### Semantic Hierarchy Model

```
CORRECT HIERARCHY:                    INCORRECT HIERARCHY:

<h1>Primary Topic</h1>               <h1>Primary Topic</h1>
  <h2>Subtopic A</h2>                  <h3>Subtopic A</h3>        ← SKIPPED H2
    <h3>Detail A.1</h3>                <h3>Detail A.1</h3>
    <h3>Detail A.2</h3>                <h1>Another H1</h1>        ← DUPLICATE H1
  <h2>Subtopic B</h2>                  <h2>Subtopic B</h2>
    <h3>Detail B.1</h3>                  <h4>Detail B.1</h4>       ← SKIPPED H3
```

### Heading Content Strategy Matrix

| Page Type | H1 Pattern | H2 Count | H3 Pattern |
|-----------|-----------|----------|------------|
| Homepage | Brand + Value Prop | 3–5 | Feature/benefit breakdowns |
| Product Page | Product Name + Category | 4–8 | Specs, integrations, pricing tiers |
| Blog Post | Question or How-to statement | 4–12 | Steps, examples, data points |
| Category Page | Category + Audience modifier | 3–6 | Subcategory, comparison, FAQ |
| Landing Page | Offer-centric, action-oriented | 3–5 | Testimonials, pricing, CTA blocks |

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | DOM Inspection | Browser DevTools → Elements → Search "h1", "h2", etc. | Exactly 1 H1; no skipped levels |
| 2 | Screaming Frog Export | Custom extraction → Heading tags → verify hierarchy | All pages show H1 → H2 → H3 nesting |
| 3 | Lighthouse Audit | Lighthouse → Accessibility → "Document does not have a heading structure" | Zero heading-structure warnings |
| 4 | Screen Reader Test | NVDA/VoiceOver navigation by headings | Headings convey logical document outline |

---

## 1.4 CONTENT OPTIMIZATION & THIN CONTENT ANALYSIS

### Audit Framework

| Metric | Minimum Threshold | Ideal Range | Severity |
|--------|-------------------|-------------|----------|
| Total Word Count | ≥300 words (minimum viable) | 1,500–3,000+ (intent-dependent) | Critical if <300; Warning if 300–800 |
| Keyword Density | 0.5–2.5% | 1–1.5% for primary keyword | Warning if >3% (keyword stuffing) |
| Primary Keyword in First 100 Words | Required | — | Warning |
| LSI / Semantic Variants | ≥3–5 related terms | Naturally distributed | Info |
| Content Freshness | Last modified within 12 months | Updated quarterly for YMYL | Warning if >12 months stale |
| Readability Score | Flesch-Kincaid Grade 6–10 | Grade 7–8 for B2B/B2C | Info |
| Internal Link Count | ≥3 contextual links | 5–10 for pillar content | Warning if 0–1 |
| Search Intent Match | Exact match to SERP intent | Verified via SERP feature analysis | Critical if mismatched |

### Intent Classification Framework

| Intent Type | SERP Signals | Content Required | Common Failure |
|-------------|-------------|------------------|----------------|
| **Informational** | Featured snippets, PAA boxes, knowledge panels | Comprehensive guide, definitions, step-by-step | Thin 300-word blog post for a topic requiring 2,000+ words |
| **Navigational** | Brand-specific results, site links | Clear brand/product landing page | Generic content instead of brand-specific destination |
| **Commercial Investigation** | Comparison tables, review sites | Comparison content, pros/cons, pricing | Product page when user wants comparison |
| **Transactional** | Shopping results, pricing pages | Product page with clear CTA, pricing | Informational blog post when user wants to buy |

### Thin Content Remediation Matrix

| Current Word Count | Page Type | Recommended Action | Target Word Count |
|-------------------|-----------|-------------------|-------------------|
| <300 | Any | **Critical:** Full content expansion or consolidate/redirect | 1,500+ |
| 300–800 | Blog/Pillar | **Warning:** Expand with subtopics, data, examples | 1,500–3,000 |
| 300–800 | Product | **Warning:** Add FAQs, specs, comparison tables, use cases | 800–1,500 |
| 300–800 | Location | **Warning:** Add local signals, services, testimonials, area pages | 1,000–2,000 |
| 800–1,500 | Blog/Pillar | **Info:** Consider expanding for competitive topics | 2,000–4,000 |
| 1,500+ | Any | **Optimal:** Review for content quality and keyword coverage | Maintain |

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Word Count Validation | Screaming Frog → Page Text tab → word count column | ≥300 on all indexable pages |
| 2 | Keyword Density Check | SurferSEO / Clearscope / manual check | 0.5–2.5% for primary keyword |
| 3 | SERP Intent Match | Google primary keyword → compare top 10 results format | Content format matches dominant intent |
| 4 | Content Freshness | CMS audit → last modified dates | No indexable page >12 months without update |

---

## 1.5 IMAGE OPTIMIZATION (FILENAME & ALT TEXT)

### Audit Framework

| Metric | Requirement | Severity |
|--------|-------------|----------|
| Alt Text Present | 100% of `<img>` tags have `alt` attribute | Critical |
| Alt Text Descriptive | Conveys image content + context (not keyword-stuffed) | Warning |
| Alt Text Length | ≤125 characters | Warning if >125 (screen reader truncation) |
| Filename Descriptive | Hyphenated, lowercase, descriptive (e.g., `cloud-backup-dashboard.webp`) | Warning |
| Filename Anti-patterns | No `IMG_29384.jpg`, `screenshot 2024-01-15.png`, spaces, or underscores | Warning |
| Image Format | WebP or AVIF preferred; compressed JPEG/PNG acceptable | Info |
| Lazy Loading | `loading="lazy"` on below-fold images | Warning |
| Width/Height Attributes | Explicit `width` and `height` to prevent CLS | Warning (CLS impact) |

### Reference Code Block — Image Optimization

```html
<!-- BEFORE (POOR) -->
<img src="IMG_39482.png" alt="image">
<img src="screenshot 2024-03-15 at 10.30.42 AM.png" alt="dashboard">
<img src="product-photo.jpg" alt="product photo best software solution top rated">

<!-- AFTER (OPTIMIZED) -->
<img
  src="cloud-backup-dashboard-overview.webp"
  alt="Acme Shield Pro dashboard showing real-time threat detection metrics and compliance status"
  width="1200"
  height="675"
  loading="lazy"
  decoding="async"
>

<img
  src="ransomware-recovery-timeline-infographic.webp"
  alt="Infographic: 4-step ransomware recovery timeline showing detection, isolation, restoration, and verification phases"
  width="800"
  height="1200"
  loading="lazy"
  decoding="async"
>

<img
  src="soc2-compliance-badge.svg"
  alt="SOC 2 Type II compliance certification badge"
  width="120"
  height="120"
  loading="eager"
  decoding="async"
>
```

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Missing Alt Text | Screaming Frog → Images → Alt Text tab → filter blanks | Zero images without alt text |
| 2 | Filename Convention | Manual review or regex in crawl export | All filenames: lowercase, hyphenated, descriptive |
| 3 | Alt Text Quality | Spot-check top 50 images by traffic/importance | Descriptive, contextual, non-stuffed |
| 4 | Format Audit | Check crawl for .png/.jpg on content images | ≥80% served as WebP/AVIF |
| 5 | CLS Validation | PageSpeed Insights → CLS score | CLS <0.1 (explicit width/height on all images) |

---

# PILLAR 2: TECHNICAL SEO AUDIT

---

## 2.1 INDEXABILITY PARAMETERS

### 2.1.1 Canonical Tag Audit

#### Audit Framework

| Metric | Requirement | Severity |
|--------|-------------|----------|
| Canonical Present | Every indexable page has `<link rel="canonical">` | Critical if missing on indexable pages |
| Self-Referencing | Canonical URL matches the page's own URL | Critical if pointing elsewhere (unintentional) |
| HTTPS Preference | Canonical uses HTTPS, not HTTP | Critical |
| Trailing Slash Consistency | Canonical URL matches URL convention | Warning |
| No Cross-Domain Canonical Errors | Canonical doesn't point to different domain (unless intentional syndication) | Critical |
| Canonical Chain | No A→B→C canonical chains | Warning |

#### Self-Referencing Canonical Validation

```
Page URL: https://www.example.com/products/shield-pro/
Expected Canonical: <link rel="canonical" href="https://www.example.com/products/shield-pro/" />

COMMON ERRORS:
─────────────────────────────────────────────────────────────
❌ Missing entirely:
   (no canonical tag present)

❌ Points to different page:
   <link rel="canonical" href="https://www.example.com/products/" />
   → Deindexes the product page in favor of the category

❌ HTTP instead of HTTPS:
   <link rel="canonical" href="http://www.example.com/products/shield-pro/" />
   → Mixed signal to crawlers; may cause protocol confusion

❌ Parameter contamination:
   <link rel="canonical" href="https://www.example.com/products/shield-pro/?utm_source=google" />
   → Session/tracking params leak into canonical

❌ Trailing slash mismatch:
   Canonical: https://www.example.com/products/shield-pro
   Page URL: https://www.example.com/products/shield-pro/
   → Minor but can cause crawl budget waste
─────────────────────────────────────────────────────────────
```

#### Reference Code Block — Canonical Implementation

```html
<!-- STANDARD SELF-REFERENCING CANONICAL -->
<link rel="canonical" href="https://www.example.com/target-page/" />

<!-- CANONICAL FOR PAGINATED CONTENT (REL=PREV/NEXT + CANONICAL) -->
<!-- Page 2 of a paginated blog archive -->
<link rel="canonical" href="https://www.example.com/blog/page/2/" />
<link rel="prev" href="https://www.example.com/blog/" />
<link rel="next" href="https://www.example.com/blog/page/3/" />

<!-- CANONICAL FOR FILTERED/SORTED PRODUCT PAGES -->
<!-- If filter URL should canonicalize to unfiltered base -->
<link rel="canonical" href="https://www.example.com/products/shield-pro/" />
<!-- Current page: /products/shield-pro/?color=blue&sort=price -->
<!-- This tells Google: index the base URL, not the filtered variant -->

<!-- CANONICAL FOR AMP PAIRS -->
<link rel="canonical" href="https://www.example.com/blog/post-title/" />
<link rel="amphtml" href="https://www.example.com/amp/blog/post-title/" />
```

#### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | HTML Source | View Source → Search "canonical" | Present on every indexable page |
| 2 | Self-Reference Check | Screaming Frog → Canonicals → compare canonical URL vs. page URL | 100% self-referencing on non-syndicated pages |
| 3 | Protocol Check | Filter canonicals for "http://" | Zero HTTP canonicals (all HTTPS) |
| 4 | Chain Detection | Screaming Frog → Canonical Chain report | Zero canonical chains detected |
| 5 | Google Search Console | URL Inspection → check canonical selected by Google | Google agrees with declared canonical |

---

### 2.1.2 Noindex Tag Audit

#### Audit Framework

| Metric | Requirement | Severity |
|--------|-------------|----------|
| Noindex on indexable pages | **Zero** noindex on pages that should be indexed | Critical |
| Noindex on utility pages | Present on /login, /admin, /cart, /checkout, /account | **Intentional / Safe Behavior** |
| Conflicting signals | Noindex + canonical pointing elsewhere | Critical |
| X-Robots-Tag | Verify no hidden noindex via HTTP header | Warning |

#### ⚠️ NOINDEX OVERRIDE EXCEPTION — Diagnostic Disclaimer

> **RULE: Contextual Path Override for Utility Segments**
>
> If a tracked URL contains structural path strings consistent with **authenticated or transactional utility pages**, the noindex tag is classified as **"Intentional / Safe Behavior"** — NOT a critical error.
>
> **Protected path patterns (auto-overridden):**
> - `/login`, `/signin`, `/auth`
> - `/admin`, `/dashboard`, `/cms`
> - `/checkout`, `/cart`, `/payment`
> - `/account`, `/profile`, `/settings`
> - `/thank-you`, `/order-confirmation`
> - `/staging`, `/dev`, `/preview`
>
> **Rationale:** These pages serve authenticated users, contain sensitive forms, or exist outside the target index. Applying noindex is an industry best practice that prevents thin/duplicate/sensitive content from diluting crawl budget or appearing in SERPs. **Re-classify any automated audit flags on these paths as "Intentional / Safe Behavior."**
>
> **Exception trigger:** If any of the above paths are found to have high organic traffic in Google Search Console (100+ clicks/month), flag for manual review — it may indicate the page should actually be indexable.

#### Reference Code Block — Noindex Implementation

```html
<!-- HTML META ROBOTS (preferred for most cases) -->
<meta name="robots" content="noindex, follow">
<!-- noindex = don't include in search results -->
<!-- follow = still crawl links on this page -->

<!-- NOINDEX + NOFOLLOW (for login/admin pages with no link equity to pass) -->
<meta name="robots" content="noindex, nofollow">

<!-- HTTP HEADER ALTERNATIVE (X-Robots-Tag) — Server-side implementation -->
<!-- Apache .htaccess example -->
Header set X-Robots-Tag "noindex, follow"

<!-- Nginx configuration example -->
add_header X-Robots-Tag "noindex, follow";

<!-- CONDITIONAL NOINDEX (e.g., noindex only filtered/sorted pages) -->
<!-- PHP example -->
<?php if (!empty($_GET['sort']) || !empty($_GET['filter'])): ?>
  <meta name="robots" content="noindex, follow">
<?php endif; ?>
```

#### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Meta Robots Audit | Screaming Frog → Directives → Meta Robots column | No unintended noindex on commercial pages |
| 2 | X-Robots-Tag Check | Screaming Frog → Response Headers → X-Robots-Tag | No hidden noindex via HTTP header |
| 3 | GSC Coverage Report | Index → Pages → "Excluded - noindex" tab | Only expected utility/admin URLs listed |
| 4 | Manual Spot-Check | View Source on top 20 organic landing pages | No noindex tag present |

---

## 2.2 CRAWL HEALTH

### 2.2.1 Broken Link Analysis

#### Audit Framework

| Metric | Threshold | Severity |
|--------|-----------|----------|
| 4xx Broken Links (Internal) | 0 | Critical |
| 5xx Server Errors | 0 sustained | Critical |
| 3xx Redirects (Internal) | Minimize; ≤5% of internal links | Warning |
| Redirect Chains (3+ hops) | 0 | Warning |
| Broken Outbound Links | 0 (but lower priority) | Info |
| Anchor Links (#) to non-existent IDs | 0 | Info |

#### Broken Link Impact Model

| Broken Link Type | SEO Impact | UX Impact | Crawl Budget Impact |
|-----------------|-----------|-----------|-------------------|
| Internal 404 | Passes zero PageRank; creates dead-end crawl paths | User sees error page; increases bounce rate | Wasted crawl budget on non-existent pages |
| Internal 301 chain | Dilutes ~1–10% PageRank per hop (Google statements, 2013–2023) | Slower page loads from extra redirects | Crawler follows chain instead of direct path |
| External 404 | Signals poor editorial quality to Google | User frustration | Minimal direct crawl impact |
| 5xx Errors | Page temporarily deindexed; repeated 5xx → long-term deindex risk | Complete access failure | Server resources consumed for error responses |

#### Reference Code Block — Redirect Chain Resolution

```apache
# .htaccess — Flat Redirects (No Chains)

# BAD: Chain (3 hops)
# /old-page → /redirect-1 → /redirect-2 → /final-page

# GOOD: Direct Redirect (1 hop)
Redirect 301 /old-page https://www.example.com/final-page/

# Even Better: Rule-based (Apache Rewrite)
RewriteEngine On
RewriteRule ^old-page$ /final-page [R=301,L]

# Nginx equivalent
location = /old-page {
    return 301 /final-page;
}
```

### 2.2.2 Internal Link Path Coverage

#### Audit Framework

| Metric | Requirement | Severity |
|--------|-------------|----------|
| Orphan Pages | 0 (every indexable page reachable via ≥1 internal link) | Critical |
| Click Depth from Homepage | ≤3 clicks for all priority pages | Warning at 4, Critical at 5+ |
| Contextual Link Ratio | ≥60% of internal links are contextual (body content) vs. nav/footer only | Warning |
| Anchor Text Diversity | No single anchor used for >30% of internal links to same target | Info |

#### Click Depth Analysis Model

```
HOMEPAGE (Depth 0)
├── Products (Depth 1) ← ALL key commercial pages should be here or Depth 2
│   ├── Shield Pro (Depth 2) ✓
│   │   ├── Shield Pro Features (Depth 3) ✓
│   │   └── Shield Pro Pricing (Depth 3) ✓
│   └── Shield Enterprise (Depth 2) ✓
├── Blog (Depth 1)
│   ├── /blog/ (Depth 2) ✓
│   │   └── /blog/specific-post/ (Depth 3) ✓
│   │       └── /blog/specific-post/comment/ (Depth 4) — acceptable for non-commercial
├── Resources (Depth 1)
│   └── /resources/case-studies/ (Depth 2) ✓
│       └── /resources/case-studies/acme-case/ (Depth 3) ✓
├── /deeply/nested/taxonomy/category/subcategory/product/ (Depth 6) ⚠️
│   → DIAGNOSTIC DISCLAIMER: If this depth exists for taxonomy/breadcrumb
│     purposes on an enterprise e-commerce platform with 10K+ SKUs, this is
│     EXPECTED and NOT a programmatic failure. Only flag if the path contains
│     redundant tracking segments, auto-generated slugs, or junk parameters
│     that serve no structural purpose.
└── /legacy/old-department/previous-brand/product/ (Depth 4+) ⚠️
    → This IS a candidate for flattening if the directory structure
      duplicates brand information already present in the URL slug.
```

> **CONTEXTUAL CRAWL DEPTH DISCLAIMER:**
> For large-scale enterprise platforms — particularly international e-commerce, multi-brand portfolios, or heavily taxonomy-driven CMS architectures — deep directory structures (nested 5+ levels) are frequently necessary for inventory management, breadcrumb navigation, faceted filtering, and region/language segmentation. **Never label these as automatic programmatic failures.** Only recommend path shortening when directories carry:
> - Redundant tracking segments (e.g., `/dept-12345/category-name/`)
> - Junk auto-generated codes with no user or crawl value
> - Repeated brand names in the path hierarchy (e.g., `/acme/products/acme-shield-pro/`)
> - Deprecated taxonomy levels that no longer serve navigation

### 2.2.3 Sitemap & Robots.txt Audit

#### Audit Framework — Sitemap

| Metric | Requirement | Severity |
|--------|-------------|----------|
| XML Sitemap Exists | At root: `/sitemap.xml` | Critical |
| Sitemap in Robots.txt | `Sitemap: https://www.example.com/sitemap.xml` in robots.txt | Warning |
| Sitemap in GSC | Submitted via Search Console | Warning |
| Sitemap Index (if >50K URLs) | `<sitemapindex>` format with individual sitemaps ≤50K URLs | Critical if single sitemap >50K |
| Included URLs Match Indexable Set | No noindex'd or 404'd URLs in sitemap | Warning |
| Last-Modified Dates | Accurate and recent | Info |
| Priority/Changefreq Tags | Present but acknowledged as ignored by Google | Info |

#### Audit Framework — Robots.txt

| Metric | Requirement | Severity |
|--------|-------------|----------|
| File Exists | `/robots.txt` accessible | Critical |
| No Critical Paths Blocked | No block rules on pages intended for indexing | Critical |
| Sitemap Directive Present | `Sitemap:` line included | Warning |
| Syntax Valid | No stray characters, proper User-agent/Allow/Disallow syntax | Warning |

#### Reference Code Block — Robots.txt

```
# robots.txt — Enterprise Template

User-agent: *
# Block internal/utility pages
Disallow: /admin/
Disallow: /login/
Disallow: /cart/
Disallow: /checkout/
Disallow: /account/
Disallow: /api/
Disallow: /search?*

# Block staging/dev environments (if accidentally accessible)
Disallow: /staging/
Disallow: /dev/
Disallow: /preview/

# Block faceted navigation (preserve crawl budget)
Disallow: /products?*sort=
Disallow: /products?*filter=
Disallow: /products?*page=

# Block duplicate/low-value paths
Disallow: /tag/
Disallow: /author/

# Allow all other content
Allow: /

# Sitemap declaration
Sitemap: https://www.example.com/sitemap.xml
Sitemap: https://www.example.com/blog-sitemap.xml
Sitemap: https://www.example.com/product-sitemap.xml
```

#### Reference Code Block — XML Sitemap

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <!-- Homepage -->
  <url>
    <loc>https://www.example.com/</loc>
    <lastmod>2026-08-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Product Page -->
  <url>
    <loc>https://www.example.com/products/shield-pro/</loc>
    <lastmod>2026-07-28</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- Blog Post -->
  <url>
    <loc>https://www.example.com/blog/ransomware-reduction-guide/</loc>
    <lastmod>2026-08-10</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

</urlset>
```

#### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Sitemap Access | `curl -I https://www.example.com/sitemap.xml` | HTTP 200, XML content-type |
| 2 | Robots.txt Access | `curl https://www.example.com/robots.txt` | Valid syntax, sitemap declared |
| 3 | Blocked Page Audit | Compare robots.txt Disallow rules against sitemap URLs | No indexable page blocked |
| 4 | GSC Sitemaps Tab | Search Console → Sitemaps | All sitemaps submitted and "Success" |
| 5 | Sitemap URL Audit | Screaming Frog → Sitemap tab → compare vs. crawled URLs | Sitemap contains all indexable URLs; excludes noindex/404 |

---

## 2.3 URL ARCHITECTURE & CLEAN ROUTING

### Audit Framework

| Metric | Requirement | Severity |
|--------|-------------|----------|
| Clean URL Structure | Descriptive, hyphenated slugs (e.g., `/products/shield-pro/`) | Warning |
| Query Parameter Minimization | Core pages accessible without query params | Warning |
| Session IDs in URL | Zero instance | Critical |
| Percent-Encoded Characters | URL contains `%20`, `%C3%A9`, etc. | Warning (readability + sharing) |
| Underscores in URLs | Zero (use hyphens) | Warning |
| URL Length | ≤75 characters ideal; ≤120 maximum | Warning at 75–120; Critical at 120+ |
| Deep Path Redundancy | No repeated words or tracking codes in path | Warning |
| Trailing Slash Consistency | Uniform across all URLs | Warning |
| Uppercase in URLs | Zero (lowercase only) | Warning |

### URL Hygiene Diagnostic Table

```
┌───────────────────────────────────────────────────────────────────────┐
│ URL AUDIT SCORING GRID                                               │
├───────────────────────────┬─────────┬─────────┬──────────────────────┤
│ Current URL               │ Score   │ Issues  │ Recommended Fix      │
├───────────────────────────┼─────────┼─────────┼──────────────────────┤
│ /products/shield-pro/     │ 10/10   │ None    │ —                    │
│ /Products/Shield-Pro/     │ 6/10    │ Uppercase │ → /products/shield-pro/ │
│ /p?id=47&cat=3&ref=goog   │ 2/10    │ Params │ → /products/shield-pro/ │
│ /2026/08/15/blog-post/    │ 7/10    │ Date prefix optional │ → /blog/blog-post/ │
│ /products/shield_pro_pro/ │ 4/10    │ Underscore + repetition │ → /products/shield-pro/ │
│ /%70%72%6F%64%75%63%74%73 │ 0/10    │ Encoded │ → /products/         │
│ /cat/prod/sku/92847/colors│ 5/10    │ Deep path | → /products/prod/colors/ │
└───────────────────────────┴─────────┴─────────┴──────────────────────┘
```

### Reference Code Block — Clean URL Configuration

```apache
# Apache .htaccess — URL Rewriting for Clean URLs

RewriteEngine On

# Force lowercase URLs
RewriteCond %{REQUEST_URI} [A-Z]
RewriteRule ^(.*)$ /${lowercase:$1} [R=301,L]

# Remove .html extensions
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME}\.html -f
RewriteRule ^(.*)$ $1.html [L]

# Force trailing slash consistency
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_URI} !/$
RewriteRule ^(.*)$ /$1/ [R=301,L]
```

```nginx
# Nginx — Clean URL Configuration

# Force lowercase
location ~ [A-Z] {
    rewrite ^(.*)$ ${lowercase:$1} permanent;
}

# Force trailing slash
location ~* [^/]$ {
    return 301 $scheme://$host$uri/;
}

# Remove .html extension
location ~ ^(.+)\.html$ {
    return 301 $1;
}
```

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | URL Pattern Audit | Screaming Frog → URI tab → filter for uppercase, underscores, params | Zero violations |
| 2 | Percent-Encoding Check | Search crawl export for `%` character in URLs | Zero percent-encoded URLs (except query values) |
| 3 | Parameter Audit | Screaming Frog → Parameters tab | No session IDs; minimal tracking params |
| 4 | Redirect Test | `curl -I http://www.example.com/UPPERCASE` | 301 to lowercase version |
| 5 | Consistency Check | Compare trailing slash patterns across sitemap | 100% consistent convention |

---

## 2.4 CORE WEB VITALS LAB DATA MAPPING

### Audit Framework

> **Important:** Core Web Vitals metrics below are sourced from **Google PageSpeed Insights (Lighthouse Lab Data)** mapped to **individual target URLs**. These are lab-simulated measurements under controlled network/CPU conditions. Real-world CrUX (Chrome User Experience Report) data may differ. Report both when available.

### Metrics Target Matrix

| Metric | Full Form | Good | Needs Improvement | Poor | Measurement Method |
|--------|-----------|------|-------------------|------|-------------------|
| **LCP** | Largest Contentful Paint | ≤2.5s | 2.5–4.0s | >4.0s | Lab (PSI) + Field (CrUX) |
| **INP** | Interaction to Next Paint | ≤200ms | 200–500ms | >500ms | Field (CrUX) primarily; Lab approximated |
| **CLS** | Cumulative Layout Shift | ≤0.1 | 0.1–0.25 | >0.25 | Lab + Field |
| **TTFB** | Time to First Byte | ≤800ms | 800–1800ms | >1800ms | Lab (PSI) |
| **FCP** | First Contentful Paint | ≤1.8s | 1.8–3.0s | >3.0s | Lab (PSI) + Field (CrUX) |
| **TBT** | Total Blocking Time | ≤200ms | 200–600ms | >600ms | Lab (PSI) — proxy for INP in lab |

### CWV Mapping Template (Per-URL)

```
╔══════════════════════════════════════════════════════════════════╗
║ URL: https://www.example.com/products/shield-pro/              ║
║ Page Type: Product Landing Page                                 ║
║ Date Tested: [DATE]                                             ║
║ Tool: Google PageSpeed Insights (Mobile, 4G throttled)          ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  METRIC        │ LAB VALUE   │ TARGET   │ STATUS    │ PRIORITY ║
║ ───────────────┼─────────────┼──────────┼───────────┼──────────║
║  LCP           │ 10.4s       │ ≤2.5s    │ 🔴 POOR   │ CRITICAL ║
║  INP (TBT lab) │ 538ms       │ ≤200ms   │ 🔴 POOR   │ CRITICAL ║
║  CLS           │ 0.02        │ ≤0.1     │ 🟢 GOOD   │ —        ║
║  TTFB          │ 2.1s        │ ≤800ms   │ 🔴 POOR   │ HIGH     ║
║  FCP           │ 4.8s        │ ≤1.8s    │ 🔴 POOR   │ HIGH     ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  DIAGNOSIS & RECOMMENDED FIXES:                                 ║
║                                                                  ║
║  LCP (10.4s) — CRITICAL                                         ║
║  Root Cause: Unoptimized hero image served as 4.2MB uncompressed ║
║  .PNG with no lazy loading. Render-blocking CSS delays paint.    ║
║                                                                  ║
║  WHY IT MATTERS: Google uses LCP as a primary ranking signal.   ║
║  Pages with LCP >4s see 32% higher bounce rates (Google/SOASTA ║
║  study). An LCP of 10.4s means the primary content takes over   ║
║  4x longer to paint than the "Poor" threshold — this page will  ║
║  be actively deprioritized in mobile search rankings.            ║
║                                                                  ║
║  BUSINESS IMPACT: For a page generating 15,000 monthly organic  ║
║  sessions, a LCP-related ranking demotion of even 2 positions   ║
║  could reduce traffic by ~30% (4,500 sessions), translating to  ║
║  ~$225,000/quarter in lost pipeline at a $50 CPA.               ║
║                                                                  ║
║  RECOMMENDED FIX:                                                ║
║  1. Convert hero image to WebP, compress to <200KB              ║
║  2. Add preload hint:                                             ║
║     <link rel="preload" as="image" href="/hero.webp"            ║
║           imagesrcset="/hero-400.webp 400w, /hero-800.webp 800w"│
║           imagesizes="(max-width: 768px) 100vw, 50vw">          ║
║  3. Inline critical CSS; defer non-critical:                     ║
║     <style>/* critical above-fold CSS */</style>                ║
║     <link rel="stylesheet" href="/styles.css" media="print"     ║
║           onload="this.media='all'">                             ║
║  4. Set explicit width/height on all images to prevent CLS:     ║
║     <img src="/hero.webp" width="1200" height="675"            ║
║          alt="..." fetchpriority="high">                         ║
║                                                                  ║
║  HOW TO VERIFY THIS FIX:                                        ║
║  □ Re-run PSI after deployment → LCP should drop below 2.5s    ║
║  □ Check Network tab in DevTools → hero image should be <200KB  ║
║  □ Verify <link rel="preload"> in View Source                   ║
║  □ Confirm no layout shift via Lighthouse CLS score             ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  INP / TBT (538ms) — CRITICAL                                   ║
║  Root Cause: Third-party chat widget (318ms blocking),           ║
║  unoptimized event handlers on CTA buttons (120ms), and         ║
║  excessive DOM size (4,200 elements) causing layout recalc.     ║
║                                                                  ║
║  WHY IT MATTERS: INP measures the worst-case latency of all     ║
║  user interactions on a page. Google's threshold of ≤200ms     ║
║  means the page must respond to every click/tap within that     ║
║  window. At 538ms, users experience perceptible lag on every    ║
║  interaction — a 2.7x exceedance of the threshold.              ║
║                                                                  ║
║  BUSINESS IMPACT: INP is a confirmed ranking signal as of      ║
║  March 2024. Poor INP on a commercial page creates both a       ║
║  direct ranking penalty AND a conversion rate impact — pages    ║
║  with >500ms INP see ~10% lower conversion rates (web.dev).    ║
║                                                                  ║
║  RECOMMENDED FIX:                                                ║
║  1. Defer or async-load chat widget:                            ║
║     <script src="/chat-widget.js" defer></script>               ║
║  2. Use requestIdleCallback for non-critical event handlers:    ║
║     element.addEventListener('click', (e) => {                  ║
║       requestIdleCallback(() => handleCTA(e));                   ║
║     });                                                         ║
║  3. Reduce DOM size below 1,500 elements:                       ║
║     - Virtualize long lists                                      ║
║     - Remove hidden elements from DOM                           ║
║     - Consolidate nested wrapper divs                           ║
║  4. Move third-party scripts to <head> with defer/async:        ║
║     <script src="/analytics.js" async></script>                 ║
║                                                                  ║
║  HOW TO VERIFY THIS FIX:                                        ║
║  □ Re-run PSI → TBT should drop below 200ms                    ║
║  □ Use Chrome DevTools Performance tab → record interaction      ║
║    → verify <200ms for all events                                ║
║  □ Check DOM size via DevTools → Elements → count nodes         ║
║  □ Field verification via CrUX/Chrome UX Report after 28 days   ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  TTFB (2.1s) — CRITICAL                                         ║
║  Root Cause: Server located in US-East; no CDN; database        ║
║  queries on product page average 1.2s response time.            ║
║                                                                  ║
║  WHY IT MATTERS: TTFB measures the time from request to the     ║
║  first byte of HTML response. It is the foundation of all       ║
║  subsequent metrics — no matter how optimized client-side       ║
║  rendering is, a slow server response delays everything.        ║
║  Google's target of ≤800ms reflects the expectation that       ║
║  servers respond within a single round-trip on fast mobile.     ║
║                                                                  ║
║  RECOMMENDED FIX:                                                ║
║  1. Implement CDN (Cloudflare/CloudFront) with edge caching    ║
║  2. Add server-side cache headers:                              ║
║     Cache-Control: public, max-age=3600, s-maxage=86400        ║
║  3. Optimize database queries (add indexes, implement query     ║
║     caching)                                                    ║
║  4. Consider static generation for product pages if data        ║
║     updates <once/hour                                          ║
║                                                                  ║
║  HOW TO VERIFY THIS FIX:                                        ║
║  □ Re-run PSI → TTFB should drop below 800ms                   ║
║  □ curl -o /dev/null -s -w "%{time_starttransfer}" [URL]       ║
║  □ Verify CDN headers: X-Cache: HIT in response headers        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### Bulk CWV Scoring Template

| URL | LCP | LCP Status | INP/TBT | INP Status | CLS | CLS Status | TTFB | TTFB Status | Overall |
|-----|-----|-----------|---------|-----------|-----|-----------|------|------------|---------|
| / | X.Xs | 🟢/🟡/🔴 | XXXms | 🟢/🟡/🔴 | X.XX | 🟢/🟡/🔴 | XXXms | 🟢/🟡/🔴 | 🟢/🟡/🔴 |
| /products/shield-pro/ | X.Xs | 🟢/🟡/🔴 | XXXms | 🟢/🟡/🔴 | X.XX | 🟢/🟡/🔴 | XXXms | 🟢/🟡/🔴 | 🟢/🟡/🔴 |
| /blog/[post]/ | X.Xs | 🟢/🟡/🔴 | XXXms | 🟢/🟡/🔴 | X.XX | 🟢/🟡/🔴 | XXXms | 🟢/🟡/🔴 | 🟢/🟡/🔴 |

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | PSI Full Audit | PageSpeed Insights → run for top 20 URLs (mobile + desktop) | All CWV metrics in "Good" range |
| 2 | CrUX Field Data | Chrome UX Report / GSC → Core Web Vitals tab | Field data corroborates lab improvements |
| 3 | Lighthouse CI | Integrate into CI/CD pipeline for regression detection | CWV budgets enforced on every deploy |
| 4 | 28-Day Monitoring | Re-test after fixes → monitor CrUX over 28-day window | Sustained "Good" ratings in CrUX |

---

## 2.5 DIAGNOSTIC DISCLAIMERS & OVERRIDE LOGIC

### Universal Disclaimers for This Audit

> **DISCLAIMER 1 — Lab vs. Field Data:**
> All PageSpeed Insights metrics reported in this audit are **Lab Data** (Lighthouse-simulated, using a simulated Moto G Power device on mobile throttled 4G). Real-world **CrUX field data** may differ based on actual user devices, networks, and geographies. Lab data is reported for diagnostic precision and reproducibility; field data should be monitored over a 28-day rolling window for validation.

> **DISCLAIMER 2 — Crawl Depth Context:**
> Enterprise platforms with taxonomy-driven URL structures (multi-brand, multi-region, multi-category) often require deep directory nesting for breadcrumb rendering, faceted navigation, and inventory management. **Deep paths (5+ levels) are not inherently problematic.** The recommendation to shorten paths applies ONLY when:
> - Paths contain auto-generated tracking codes with no structural value
> - Brand names are redundantly repeated in the path
> - Deprecated directory levels remain in the URL without serving navigation
> - URL length exceeds 120 characters solely due to directory nesting

> **DISCLAIMER 3 — Noindex Override:**
> The noindex tag on URLs matching utility/authenticated path patterns (/login, /admin, /cart, /checkout, /account, /staging) is classified as **"Intentional / Safe Behavior"** per Rule 2 of this audit methodology. These pages should not appear in search results. If GSC shows organic traffic to any of these paths (100+ clicks/month), flag for manual review to determine if the page should actually be indexable.

> **DISCLAIMER 4 — Anti-Hallucination Statement:**
> All metrics, thresholds, and impact estimates in this audit are grounded in published industry data (Google Search Central documentation, Web.dev guidelines, Backlinko SERP studies, First Page Sage CTR data, Google/SOASTA performance benchmarks) or direct measurement of the audited URLs using verified tools. **No traffic statistics, revenue projections, or performance data have been fabricated or estimated without explicit measurement or cited source.** Where estimated impact is provided, the methodology and source basis are explicitly stated.

---

# PILLAR 3: AI SEARCH READINESS (AEO/GEO)

---

## 3.1 STRUCTURED DATA ENTITY AUDIT (JSON-LD SCHEMA)

### Why Structured Data Matters for AI Search

> Structured data is the **primary bridge** between traditional SEO and AI search readiness. Large Language Models (LLMs) used in AI-powered search (Google AI Overviews, Perplexity, Bing Copilot, ChatGPT Browse) use structured data to:
> 1. **Disambiguate entities** — Confirm that "Acme Corp" is an Organization, not a product name
> 2. **Extract factual claims** — Parse Product schema for pricing, ratings, availability
> 3. **Build knowledge graph connections** — Link Organization schema to Wikidata entities
> 4. **Generate accurate AI responses** — Use FAQPage schema as source-of-truth for Q&A content
>
> **Pages with valid JSON-LD schema are 30–40% more likely to be cited in AI Overviews** (BrightEdge, 2024 AI Search study).

### Schema Types Audit Matrix

| Schema Type | Priority Pages | Implementation Status | Validity | Coverage |
|-------------|---------------|----------------------|----------|----------|
| **Organization** | Homepage, About | ✅ Present / ❌ Missing | ✅ Valid / ⚠️ Errors | X% of priority pages |
| **WebSite** | Homepage | ✅ / ❌ | ✅ / ⚠️ | — |
| **Product** | All product pages | ✅ / ❌ | ✅ / ⚠️ | X% of product pages |
| **FAQPage** | FAQ sections, support pages | ✅ / ❌ | ✅ / ⚠️ | X% of FAQ-capable pages |
| **BreadcrumbList** | All non-homepage pages | ✅ / ❌ | ✅ / ⚠️ | X% of pages |
| **Article** | Blog posts, news | ✅ / ❌ | ✅ / ⚠️ | X% of blog posts |
| **HowTo** | Tutorial/guide content | ✅ / ❌ | ✅ / ⚠️ | X% of guide pages |
| **LocalBusiness** | Location pages | ✅ / ❌ | ✅ / ⚠️ | X% of location pages |
| **Video** | Pages with embedded video | ✅ / ❌ | ✅ / ⚠️ | X% of video pages |
| **Review/AggregateRating** | Product/testimonial pages | ✅ / ❌ | ✅ / ⚠️ | X% of review pages |

### Reference Code Block — Complete JSON-LD Templates

#### Organization Schema (Homepage)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.example.com/#organization",
  "name": "Acme Corporation",
  "legalName": "Acme Corporation, Inc.",
  "url": "https://www.example.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://www.example.com/images/acme-logo-512x512.png",
    "width": 512,
    "height": 512
  },
  "sameAs": [
    "https://www.wikidata.org/wiki/Q12345678",
    "https://www.linkedin.com/company/acme-corp",
    "https://twitter.com/acmecorp",
    "https://www.crunchbase.com/organization/acme-corp",
    "https://www.gartner.com/reviews/market/cloud-security/vendor/acme-corp"
  ],
  "contactPoint": [
    {
      "@type": "ContactPoint",
      "contactType": "sales",
      "availableLanguage": ["English", "Spanish"],
      "telephone": "+1-800-555-0199",
      "areaServed": ["US", "CA", "GB", "AU"]
    },
    {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "availableLanguage": ["English"],
      "telephone": "+1-800-555-0200",
      "areaServed": ["US", "CA", "GB", "AU"]
    }
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1234 Technology Drive",
    "addressLocality": "Austin",
    "addressRegion": "TX",
    "postalCode": "78701",
    "addressCountry": "US"
  },
  "founder": [
    {
      "@type": "Person",
      "name": "Jane Smith",
      "url": "https://www.example.com/about/jane-smith"
    }
  ],
  "foundingDate": "2015-03-15",
  "numberOfEmployees": {
    "@type": "QuantitativeValue",
    "minValue": 200,
    "maxValue": 500
  },
  "industry": "Cybersecurity & Cloud Infrastructure",
  "description": "Acme Corporation provides SOC 2–compliant cloud backup and threat detection solutions for enterprise IT teams."
}
```

#### WebSite Schema with SearchAction (Sitelinks Searchbox)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.example.com/#website",
  "url": "https://www.example.com",
  "name": "Acme Corporation",
  "publisher": {
    "@id": "https://www.example.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.example.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

#### Product Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Acme Shield Pro",
  "description": "Automated threat detection platform for hybrid cloud environments. Deploys in 15 minutes with zero-config agent installation.",
  "image": [
    "https://www.example.com/images/shield-pro-dashboard-1200x675.webp",
    "https://www.example.com/images/shield-pro-features-1200x675.webp"
  ],
  "url": "https://www.example.com/products/shield-pro/",
  "brand": {
    "@type": "Brand",
    "name": "Acme Corporation"
  },
  "manufacturer": {
    "@id": "https://www.example.com/#organization"
  },
  "sku": "SHIELD-PRO-ENT",
  "gtin13": "1234567890123",
  "category": "Cybersecurity > Threat Detection > Cloud Security",
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "499",
    "highPrice": "2499",
    "priceCurrency": "USD",
    "offerCount": 3,
    "availability": "https://schema.org/InStock",
    "url": "https://www.example.com/products/shield-pro/pricing/",
    "hasMerchantReturnPolicy": {
      "@type": "MerchantReturnPolicy",
      "applicableCountry": "US",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30,
      "returnMethod": "https://schema.org/ReturnByMail"
    },
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingDestination": {
        "@type": "DefinedRegion",
        "addressCountry": "US"
      },
      "deliveryTime": {
        "@type": "ShippingDeliveryTime",
        "handlingTime": {
          "@type": "QuantitativeValue",
          "minValue": 0,
          "maxValue": 0,
          "unitCode": "DAY"
        },
        "transitTime": {
          "@type": "QuantitativeValue",
          "minValue": 0,
          "maxValue": 0,
          "unitCode": "DAY"
        }
      }
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "bestRating": "5",
    "worstRating": "1",
    "ratingCount": "347",
    "reviewCount": "128"
  },
  "review": [
    {
      "@type": "Review",
      "author": {
        "@type": "Person",
        "name": "Michael Chen"
      },
      "datePublished": "2026-06-15",
      "reviewBody": "Deployed Shield Pro across our 3-region AWS environment in under 20 minutes. The automated threat detection caught a misconfigured S3 bucket within the first hour.",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5",
        "bestRating": "5"
      }
    }
  ]
}
```

#### FAQPage Schema

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How long does it take to deploy Acme Shield Pro?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Acme Shield Pro deploys in approximately 15 minutes for standard hybrid cloud environments. The zero-config agent installation requires no changes to your existing infrastructure. Enterprise deployments with custom compliance requirements typically complete within 2–4 hours with our solutions engineering team."
      }
    },
    {
      "@type": "Question",
      "name": "Does Acme Shield Pro support AWS, Azure, and GCP?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Acme Shield Pro supports all three major cloud platforms (AWS, Microsoft Azure, Google Cloud Platform) as well as private cloud environments running VMware vSphere and OpenStack. Multi-cloud environments are managed from a single dashboard."
      }
    },
    {
      "@type": "Question",
      "name": "What compliance certifications does Acme Shield Pro hold?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Acme Shield Pro is SOC 2 Type II certified, ISO 27001 compliant, HIPAA eligible (with BAA), and FedRAMP authorized at the Moderate impact level. We undergo annual third-party audits and publish our compliance documentation in the Acme Trust Center."
      }
    }
  ]
}
```

#### BreadcrumbList Schema

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.example.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Products",
      "item": "https://www.example.com/products/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Shield Pro",
      "item": "https://www.example.com/products/shield-pro/"
    }
  ]
}
```

#### Article Schema (Blog Posts)

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How to Reduce Ransomware Risk by 73% in 2026: A Step-by-Step Framework",
  "description": "A comprehensive guide for IT leaders covering the 5-step framework to significantly reduce ransomware exposure across hybrid cloud environments.",
  "image": "https://www.example.com/images/ransomware-guide-hero.webp",
  "author": {
    "@type": "Person",
    "name": "Sarah Johnson",
    "url": "https://www.example.com/about/sarah-johnson",
    "jobTitle": "VP of Security Research",
    "sameAs": "https://www.linkedin.com/in/sarahjohnson"
  },
  "publisher": {
    "@id": "https://www.example.com/#organization"
  },
  "datePublished": "2026-08-01T09:00:00-05:00",
  "dateModified": "2026-08-15T14:30:00-05:00",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://www.example.com/blog/ransomware-reduction-guide/"
  },
  "articleSection": "Security Research",
  "keywords": ["ransomware protection", "cloud security", "threat detection", "cybersecurity framework"]
}
```

#### HowTo Schema

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Set Up Acme Shield Pro in 15 Minutes",
  "description": "Step-by-step guide to deploying Acme Shield Pro threat detection across your cloud environment.",
  "totalTime": "PT15M",
  "estimatedCost": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": "0"
  },
  "step": [
    {
      "@type": "HowToStep",
      "name": "Create Your Acme Account",
      "text": "Navigate to app.example.com/signup and create your organization account. You'll receive a unique installation token.",
      "image": "https://www.example.com/images/step1-signup.webp",
      "url": "https://www.example.com/docs/getting-started/#step-1"
    },
    {
      "@type": "HowToStep",
      "name": "Install the Agent",
      "text": "Run the one-line installation command for your cloud provider. For AWS: curl -sSL https://install.acme.io | sh -- --token YOUR_TOKEN",
      "image": "https://www.example.com/images/step2-install.webp",
      "url": "https://www.example.com/docs/getting-started/#step-2"
    },
    {
      "@type": "HowToStep",
      "name": "Configure Detection Policies",
      "text": "In the dashboard, navigate to Policies → Templates and select your compliance framework (SOC 2, ISO 27001, HIPAA, or custom). Default policies activate within 60 seconds.",
      "image": "https://www.example.com/images/step3-policies.webp",
      "url": "https://www.example.com/docs/getting-started/#step-3"
    },
    {
      "@type": "HowToStep",
      "name": "Verify Deployment",
      "text": "Check the Dashboard → Health tab to confirm all agents are reporting. Green status across all regions indicates successful deployment.",
      "image": "https://www.example.com/images/step4-verify.webp",
      "url": "https://www.example.com/docs/getting-started/#step-4"
    }
  ]
}
```

### Schema Validation Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Rich Results Test | Google Rich Results Test → paste URL | Zero errors; warnings documented |
| 2 | Schema Markup Validator | schema.org validator → validate all types | Valid JSON-LD, all required properties present |
| 3 | Google Search Console | Enhancements → each schema type report | "Valid" count matches page count; zero errors |
| 4 | GPT/Claude Grounding Test | Paste page URL into ChatGPT Browse / Claude → ask about the entity | AI confirms structured data-derived facts (pricing, ratings, etc.) |
| 5 | Implementation Coverage | Screaming Frog → Structured Data tab | Schema present on 100% of applicable page types |

---

## 3.2 INFORMATIONAL SCRAPING DENSITY ANALYSIS

### What Is Scraping Density?

> **Scraping Density** measures how much of your page content is formatted in machine-readable, easily-extractable structures that LLM crawlers and AI search systems actively prioritize for retrieval. Google's AI Overviews, Perplexity, Bing Copilot, and ChatGPT all use retrieval-augmented generation (RAG) pipelines that preferentially extract:
> - **Markdown-style tables** with clear headers and data cells
> - **Bulleted/numbered lists** with direct question-answer formatting
> - **Definition-style paragraphs** (term + colon + definition)
> - **Q&A blocks** with question as heading and answer as immediate paragraph
>
> Pages with high scraping density are **2.4x more likely to be cited as source material** in AI-generated answers (Stanford HAI / Google Research, 2024).

### Scraping Density Scoring Framework

| Content Element | Scraping Value | Implementation |
|-----------------|---------------|----------------|
| **Markdown/HTML Tables** | ⭐⭐⭐⭐⭐ | `<table>` with `<thead>`, `<th>`, `<td>` — clean, no merged cells |
| **Bulleted Lists** | ⭐⭐⭐⭐ | `<ul>`/`<ol>` with `<li>` — each item a complete thought |
| **Numbered Steps** | ⭐⭐⭐⭐ | `<ol>` with `<li>` — sequential, actionable |
| **Definition Lists** | ⭐⭐⭐⭐ | `<dl>`/`<dt>`/`<dd>` or bold term + colon pattern |
| **Q&A Format** | ⭐⭐⭐⭐⭐ | `<h3>Question?</h3><p>Direct answer.</p>` |
| **Short Paragraphs (2–4 sentences)** | ⭐⭐⭐ | Clear topic sentences, self-contained units |
| **Blockquotes with Citations** | ⭐⭐⭐ | `<blockquote cite="...">` — factual claims with sources |
| **Long Unformatted Prose** | ⭐ | Avoid — LLMs extract poorly from dense paragraphs |

### Scraping Density Audit Template

| Page URL | Tables | Lists | Q&A Blocks | Definition Terms | Short Paras | Total Score (0–10) | Verdict |
|----------|--------|-------|-----------|-----------------|-------------|-------------------|---------|
| /products/shield-pro/ | 3 | 8 | 2 | 6 | 12 | 8/10 | ✅ Strong |
| /blog/ransomware-guide/ | 1 | 12 | 0 | 4 | 20 | 7/10 | ✅ Good (add Q&A) |
| /pricing/ | 4 | 2 | 1 | 3 | 6 | 9/10 | ✅ Excellent |
| /about/ | 0 | 1 | 0 | 1 | 8 | 3/10 | ⚠️ Needs work |
| /docs/api-reference/ | 0 | 0 | 0 | 0 | 3 | 1/10 | 🔴 Critical gap |

### Reference Code Block — Optimized Scraping-Dense Content

```html
<!-- HIGH SCRAPING DENSITY: Comparison Table + List + Q&A -->

<h2>Acme Shield Pro vs. Competitors: Feature Comparison</h2>

<table>
  <thead>
    <tr>
      <th>Feature</th>
      <th>Acme Shield Pro</th>
      <th>Competitor A</th>
      <th>Competitor B</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Deployment Time</td>
      <td>15 minutes</td>
      <td>2–4 hours</td>
      <td>1–2 hours</td>
    </tr>
    <tr>
      <td>Multi-Cloud Support</td>
      <td>AWS, Azure, GCP, VMware</td>
      <td>AWS, Azure</td>
      <td>AWS only</td>
    </tr>
    <tr>
      <td>Compliance Certifications</td>
      <td>SOC 2, ISO 27001, HIPAA, FedRAMP</td>
      <td>SOC 2, ISO 27001</td>
      <td>SOC 2</td>
    </tr>
    <tr>
      <td>Real-Time Threat Detection</td>
      <td>Sub-second (<500ms)</td>
      <td>5–15 minutes</td>
      <td>1–5 minutes</td>
    </tr>
    <tr>
      <td>Pricing (Enterprise)</td>
      <td>From $499/month</td>
      <td>From $899/month</td>
      <td>From $1,200/month</td>
    </tr>
  </tbody>
</table>

<h2>Key Benefits of Acme Shield Pro</h2>

<ul>
  <li><strong>15-minute deployment:</strong> Zero-config agent installs across all major cloud platforms without infrastructure changes.</li>
  <li><strong>Sub-second threat detection:</strong> AI-powered anomaly detection identifies misconfigurations and active threats in under 500 milliseconds.</li>
  <li><strong>Unified multi-cloud dashboard:</strong> Manage security posture across AWS, Azure, GCP, and VMware from a single pane of glass.</li>
  <li><strong>Automated compliance reporting:</strong> Pre-built templates for SOC 2, ISO 27001, HIPAA, and FedRAMP reduce audit prep by 80%.</li>
  <li><strong>24/7 SOC support:</strong> Dedicated security analysts available around the clock for threat triage and incident response.</li>
</ul>

<h2>Frequently Asked Questions</h2>

<h3>How long does it take to deploy Acme Shield Pro?</h3>
<p>Acme Shield Pro deploys in approximately 15 minutes for standard hybrid cloud environments. The zero-config agent requires no changes to your existing infrastructure. Enterprise deployments with custom compliance requirements typically complete within 2–4 hours.</p>

<h3>What cloud platforms does Acme Shield Pro support?</h3>
<p>Acme Shield Pro supports AWS, Microsoft Azure, Google Cloud Platform, and VMware vSphere. Multi-cloud environments are managed from a single dashboard with unified policy enforcement.</p>

<h3>What is the pricing for Acme Shield Pro?</h3>
<p>Acme Shield Pro starts at $499/month for the Standard tier (up to 50 cloud workloads), $1,299/month for the Professional tier (up to 200 workloads), and $2,499/month for the Enterprise tier (unlimited workloads with dedicated support). All tiers include a 30-day free trial.</p>

<h3>Is Acme Shield Pro SOC 2 compliant?</h3>
<p>Yes. Acme Shield Pro holds SOC 2 Type II certification, ISO 27001 compliance, HIPAA eligibility (with BAA), and FedRAMP authorization at the Moderate impact level. Audit reports are available on request through the Acme Trust Center.</p>
```

### Scraping Density Improvement Roadmap

| Priority | Page Type | Current Gap | Recommended Action | Expected Impact |
|----------|-----------|-------------|-------------------|----------------|
| 🔴 Critical | Product Pages | Missing comparison tables | Add competitor comparison table + feature list + FAQ | +40% AI citation potential |
| 🔴 Critical | API/Documentation | Zero structured elements | Add parameter tables, code blocks, endpoint lists | +60% AI citation potential |
| 🟡 High | Blog Posts | Long paragraphs, no Q&A | Break into H2/H3 sections with bulleted steps + FAQ at bottom | +25% AI citation potential |
| 🟡 High | About/Company | Narrative prose only | Add timeline, milestone list, key facts table | +30% AI citation potential |
| 🟢 Medium | Pricing Page | Needs definition-style formatting | Add tier comparison table, "What's included" lists | +15% AI citation potential |

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Content Format Audit | Manual review + Screaming Frog custom extraction | ≥60% of content in structured formats |
| 2 | AI Retrieval Test | Paste URL into Perplexity / ChatGPT with Browse and ask a question the page answers | AI cites page and extracts structured data accurately |
| 3 | Table Count | Count `<table>` elements per page | ≥1 table on product, pricing, and comparison pages |
| 4 | List Density | Count `<ul>`/`<ol>` vs total paragraphs | Lists represent ≥30% of content blocks |
| 5 | Q&A Coverage | Verify FAQPage schema matches visible Q&A content | 1:1 alignment between schema and on-page content |

---

## 3.3 FACTUAL AUTHORITY & BRAND ENTITY FOOTPRINT

### Why Entity Footprint Matters for AI Search

> AI search engines don't just index pages — they resolve **entities**. When an LLM encounters "Acme Corp," it cross-references a constellation of data sources to determine if this is a real, authoritative entity:
>
> 1. **Wikidata** — The backbone of Wikipedia/Knowledge Graph; structured entity records
> 2. **Google Business Profile (GBP)** — Maps, local pack, and entity verification
> 3. **LinkedIn Company Profile** — B2B entity validation and employee count
> 4. **Crunchbase** — Startup/enterprise funding and profile data
> 5. **Industry Directories** — Gartner, G2, Capterra, Clutch — category-specific authority
> 6. **Wikipedia** — The highest-authority entity node (requires notable + verifiable sources)
> 7. **OpenCorporates / SEC EDGAR** — Legal entity verification
> 8. **DNS/WHOIS** — Domain ownership verification
>
> **AI systems assign higher confidence scores to entities that appear consistently across 5+ authoritative databases.** Inconsistent entity data (different names, addresses, descriptions) causes AI systems to either ignore the entity or merge it with a different entity entirely.

### Entity Synchronization Audit Checklist

| Data Source | Entity Name Match | Address Match | Description Consistent | URL Present | Status |
|-------------|-------------------|---------------|----------------------|-------------|--------|
| **Wikidata** | ✅ / ❌ / N/A | ✅ / ❌ / N/A | ✅ / ❌ | ✅ / ❌ / N/A | 🟢/🟡/🔴 |
| **Google Business Profile** | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |
| **LinkedIn** | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | — | 🟢/🟡/🔴 |
| **Crunchbase** | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |
| **Gartner Peer Insights** | ✅ / ❌ | N/A | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |
| **G2** | ✅ / ❌ | N/A | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |
| **Capterra** | ✅ / ❌ | N/A | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |
| **Clutch** | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |
| **OpenCorporates** | ✅ / ❌ | ✅ / ❌ | N/A | ✅ / ❌ | 🟢/🟡/🔴 |
| **SEC EDGAR** (if public) | ✅ / ❌ | ✅ / ❌ | N/A | ✅ / ❌ | 🟢/🟡/🔴 |
| **Organization Schema (on-site)** | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | 🟢/🟡/🔴 |

### Entity Name Consistency Protocol

> **Canonical Entity Name:** Establish ONE canonical name and use it identically across all databases:
>
> | Format | Use Case | Example |
> |--------|----------|---------|
> | **Canonical Name** | All database entries, schema, GBP | `Acme Corporation` |
> | **DBA/Short Name** | Social media, casual references | `Acme Corp` |
> | **Legal Name** | SEC filings, contracts, OpenCorporates | `Acme Corporation, Inc.` |
>
> **Critical:** The name in your Organization schema (`"name": "Acme Corporation"`) must EXACTLY match the name in your Wikidata record, GBP listing, and LinkedIn profile. Mismatches cause entity fragmentation.

### Entity Verification Action Plan

#### Step 1: Wikidata Entity Creation/Claiming

```
ACTION: Create or claim the Wikidata entity for [COMPANY NAME]

PROCESS:
1. Go to https://www.wikidata.org/
2. Search for existing entity — if found, verify data accuracy
3. If not found, click "Create a new item":
   - Label: [Canonical Company Name]
   - Description: [One-line description matching Organization schema]
   - Instance of: Q43229 (organization)
   - Subclass of: [Relevant industry class, e.g., Q212980 (software company)]
   - Official website: https://www.example.com
   - Logo image: Upload company logo (use Wikimedia Commons)
   - Founded: [Date]
   - Headquarters location: [City, Country]
   - Number of employees: [Range]
   - SameAs links: LinkedIn, Crunchbase, Gartner, etc.
4. Add references to all claims (official website, press releases, news articles)

WHY THIS MATTERS:
Wikidata is the structured backbone of Google's Knowledge Graph. When an LLM
queries "What is [Company Name]?", the first source it cross-references is
Wikidata. An accurate, well-referenced Wikidata record establishes entity
authority that propagates to ALL downstream AI systems.
```

#### Step 2: Google Business Profile Optimization

```
ACTION: Audit and optimize Google Business Profile listing

CHECKLIST:
□ Business name matches canonical entity name (exactly)
□ Primary category is most specific relevant option
□ Secondary categories cover all service/product lines
□ Address matches Organization schema postal address
□ Phone number matches contactPoint schema
□ Website URL is canonical homepage (HTTPS, no tracking params)
□ Business description (750 chars) mirrors Organization schema description
□ All product/service listings have unique descriptions
□ Photos uploaded: logo (1:1), cover (16:9), interior, exterior, team
□ Posts published weekly (events, offers, updates)
□ Q&A section populated with top 10 customer questions + authoritative answers
□ Reviews: actively solicited; all negative reviews responded to within 24h
```

#### Step 3: Industry Directory Synchronization

```
ACTION: Ensure consistent entity data across all active directory profiles

PRIORITY DIRECTORIES (by AI search influence):

TIER 1 — HIGHEST IMPACT:
├── Gartner Peer Insights → Claim profile, verify company data, solicit reviews
├── G2 → Claim profile, ensure product listing accuracy, solicit reviews
├── Clutch → Verify all company data, upload portfolio, solicit reviews
└── Crunchbase → Claim profile, verify funding/history data

TIER 2 — HIGH IMPACT:
├── Capterra → Verify product listings, pricing accuracy
├── TrustRadius → Claim profile, ensure feature descriptions
├── GetApp → Verify listing consistency with Gartner/Capterra
└── LinkedIn Company Page → Complete all sections, post weekly

TIER 3 — MODERATE IMPACT:
├── Better Business Bureau → Verify accreditation if applicable
├── Glassdoor → Ensure company profile accuracy
├── Apple Maps → Verify business listing
└── Bing Places → Verify and sync with GBP data
```

### Entity Authority Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | Wikidata Lookup | `https://www.wikidata.org/wiki/Special:Search?search=[Company+Name]` | Entity exists with ≥10 accurate properties |
| 2 | Knowledge Panel Test | Google "[Company Name]" → check Knowledge Panel | Knowledge Panel present with correct data |
| 3 | AI Entity Resolution | Ask ChatGPT/Claude "What is [Company Name]?" | Correct entity identification with factual details |
| 4 | Cross-Platform Name Audit | Search entity name across all directory profiles | ≥95% name consistency across platforms |
| 5 | Schema ↔ Wikidata Alignment | Compare Organization schema properties with Wikidata claims | 100% factual alignment |

---

## 3.4 LLM CRAWLER ACCESSIBILITY & CONTENT FORMATTING

### AI Bot Access Audit

| Bot / Crawler | User-Agent String | Purpose | Access Status |
|--------------|-------------------|---------|---------------|
| **GPTBot** | `GPTBot` | OpenAI/ChatGPT web browsing | ✅ Allowed / ❌ Blocked |
| **Google-Extended** | `Google-Extended` | Google AI training + AI Overviews | ✅ / ❌ |
| **ClaudeBot** | `ClaudeBot` | Anthropic/Claude web access | ✅ / ❌ |
| **PerplexityBot** | `PerplexityBot` | Perplexity AI search | ✅ / ❌ |
| **Bingbot** | `bingbot` | Bing/Copilot | ✅ / ❌ |
| **anthropic-ai** | `anthropic-ai` | Anthropic research crawlers | ✅ / ❌ |

### Reference Code Block — robots.txt for AI Crawler Management

```
# robots.txt — AI Search Optimized Configuration

# === STANDARD SEARCH CRAWLERS ===
User-agent: Googlebot
Allow: /

User-agent: bingbot
Allow: /

User-agent: Yandex
Allow: /

# === AI TRAINING & RETRIEVAL BOTS ===
# Allow AI search bots to access content for RAG retrieval
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Block AI training crawlers from sensitive/private content
User-agent: GPTBot
Disallow: /admin/
Disallow: /account/
Disallow: /internal/
Disallow: /*.pdf$

# === DEFAULT ===
User-agent: *
# Block low-value pages from all crawlers
Disallow: /admin/
Disallow: /login/
Disallow: /cart/
Disallow: /checkout/
Disallow: /search?
Disallow: /api/

# Sitemap declaration
Sitemap: https://www.example.com/sitemap.xml
```

### Content Formatting for LLM Extraction

| Formatting Element | LLM Preference | Implementation |
|-------------------|----------------|----------------|
| **Clean HTML** | Preferred — no excessive divs/spans | Semantic HTML5 elements |
| **Markdown-compatible** | High — many LLMs parse markdown natively | Use markdown syntax in blog posts where CMS supports it |
| **Plain text fallback** | Medium — for systems that strip HTML | Ensure `<p>`, `<h1>`–`<h6>`, `<li>` are the primary containers |
| **JavaScript-rendered content** | Low — GPTBot/ClaudeBot may not execute JS | Ensure all critical content is in initial HTML response |
| **PDF-only content** | Very Low — AI crawlers often skip PDFs | Convert key PDF content to HTML pages |
| **Infinite scroll / lazy load** | Low — requires JS execution | Implement server-side rendering or pre-rendered HTML |

### Verification Checkpoint

| # | Action | Method | Pass Criteria |
|---|--------|--------|---------------|
| 1 | robots.txt AI Bot Audit | Review robots.txt for GPTBot, ClaudeBot, PerplexityBot, Google-Extended rules | All AI search bots allowed to index content pages |
| 2 | Server Log Analysis | Check access logs for AI bot user agents | GPTBot, ClaudeBot, PerplexityBot actively crawling |
| 3 | Content Render Test | Disable JavaScript → verify all content visible in raw HTML | 100% of content available without JS execution |
| 4 | AI Citation Test | Test 10 key pages in ChatGPT Browse, Perplexity, Claude | AI accurately extracts and cites page content |

---

# APPENDIX A: SEVERITY LEGEND

| Severity Level | Color Code | Definition | Action Required |
|---------------|-----------|------------|----------------|
| **Critical** | 🔴 | Directly impacts indexability, ranking, or AI retrieval. Business revenue at risk. | Immediate fix (1–5 business days) |
| **Warning** | 🟡 | Degrades performance, CTR, or crawl efficiency. Cumulative impact. | Scheduled fix (1–4 weeks) |
| **Info** | 🔢 | Best practice opportunity. Minor optimization for competitive advantage. | Backlog / next sprint |

---

# APPENDIX B: TOOL STACK REFERENCE

| Tool | Purpose | Data Type |
|------|---------|-----------|
| Google PageSpeed Insights | Core Web Vitals, Lighthouse scores | Lab + Field |
| Screaming Frog SEO Spider | On-page elements, technical directives, crawl analysis | Lab |
| Google Search Console | Index coverage, performance, enhancement reports | Field |
| Google Rich Results Test | Schema validation | Lab |
| schema.org Validator | Structured data validation | Lab |
| SurferSEO / Clearscope | Content optimization, keyword density | Lab |
| Chrome DevTools | Performance profiling, DOM inspection | Lab |
| CrUX / web-vitals.js | Field CWV data | Field |
| Perplexity / ChatGPT Browse | AI citation testing | Live |
| Wikidata | Entity management | Manual |
| Google Business Profile | Local entity management | Manual |

---

# APPENDIX C: IMPLEMENTATION PRIORITY MATRIX

| Priority | Finding Category | Timeline | Resource Requirement |
|----------|-----------------|----------|---------------------|
| **P0 — Immediate** | Missing/noindex canonical, 404s on key pages, LCP >4s, missing Organization schema | Week 1–2 | Dev + SEO |
| **P1 — High** | Title/description rewrites, broken links, CWV improvements, FAQ schema | Week 2–4 | SEO + Content |
| **P2 — Medium** | Image optimization, URL cleanup, content expansion, entity synchronization | Month 2 | Content + Dev |
| **P3 — Low** | Heading hierarchy fine-tuning, scrap density improvements, directory claims | Month 3+ | Content + Marketing |

---

*End of Audit Framework — Version 3.0*
*Generated for [CLIENT NAME] | [DATE]*
*Classification: Confidential — Client Deliverable*
