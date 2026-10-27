import type { RunAuditResult, CrawlPageSuccess } from "./types";
import type { GroupedIssue } from "./groupIssues";
import type {
  AeoCheck,
  AeoAuditResult,
  AeoBotAccessResult,
  AiVisibilityOpportunity,
  CitationReadinessCheck,
  CitationReadinessResult,
  AeoImpact,
  AeoDifficulty,
} from "./aeoTypes";
import type { AeoPageSignals } from "./aeoSignals";
import { checkAuthorPresence } from "./aeoSignals";
import { classifyPageType } from "./pageTypes";
import { detectSchemaApplicability, type SchemaApplicabilityStatus } from "./schemaApplicability";
import { AEO_COPY, metaForAeoCheck, SCHEMA_APPLICABILITY } from "./aeoCopy";
import { genuineBrokenLinks, isCloudflareEmailObfuscation } from "./brokenLinkClassification";
import { resolveCoreWebVitals } from "./coreWebVitals";
import { countUnitFor } from "./priorityIssues";

/**
 * NOTE ON `aeoSignals`: this file assumes CrawlPageSuccess has been
 * extended with an `aeoSignals: AeoPageSignals` field (see
 * PATCH_NOTES_AEO.md's crawlPage.ts diff). Pages crawled before that
 * patch lands won't have it — handled defensively below (treated as
 * "unknown", never as a false failure).
 */
type PageWithAeo = CrawlPageSuccess & { aeoSignals?: AeoPageSignals };

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function makeCheck(
  key: string,
  label: string,
  category: AeoCheck["category"],
  passed: boolean,
  affectedCount: number,
  affectedUrls: string[],
  statusText: string,
  copyKey: keyof typeof AEO_COPY,
  codeSnippetOverride?: { label: string; code: string } | null,
  applicability?: string,
  applicabilityStatus?: SchemaApplicabilityStatus,
  applicabilityReason?: string,
  qualifiedPages?: number,
  /** What affectedCount counts — "pages" by default, but "links" / "URLs" /
   * "chains" for checks whose instances aren't pages. Drives the "N …
   * affected" phrase so a badge can never call broken links "pages". */
  countUnit?: string
): AeoCheck {
  const copy = AEO_COPY[copyKey];
  // Keep the FULL URL list on the check so the exported CSV can contain
  // every affected URL ("the report and CSV must always match"). The PDF
  // only displays the first five; the display layer decides how many to
  // show, so nothing here caps what the CSV can hold.
  const DISPLAY_URL_LIMIT = 5;
  const hasMoreAffectedUrls = !passed && affectedUrls.length > DISPLAY_URL_LIMIT;

  let finalStatusText = statusText;
  if (!passed && affectedCount > 0) {
    // Most statusText strings already lead with a count ("12 pages...");
    // only prepend one when the copy doesn't already state it, so we
    // never end up with two conflicting numbers in the same line.
    const alreadyStatesCount = /\b\d+\s+(page|url|link|image|chain)/i.test(statusText);
    const unit = countUnit ?? "pages";
    const countPhrase = `${affectedCount} ${countUnitFor(affectedCount, unit)} affected.`;
    finalStatusText = alreadyStatesCount ? statusText : `${countPhrase} ${statusText}`;
    if (hasMoreAffectedUrls) {
      finalStatusText = `${finalStatusText} The complete list of affected URLs is available in the CSV export.`;
    }
  }

  return {
    key,
    label,
    category,
    passed,
    affectedCount,
    affectedUrls,
    countUnit: countUnit ?? "pages",
    statusText: finalStatusText,
    whyItMatters: copy.whyItMatters,
    recommendedFix: passed ? "" : copy.recommendedFix,
    codeSnippet: passed ? null : codeSnippetOverride ?? copy.codeSnippet ?? null,
    // Only snippets generated for THIS site (real domain/entity name) are
    // marked site-specific; the static AEO_COPY snippets are generic
    // placeholder examples and are hidden in client-facing reports.
    siteSpecificCode: passed ? false : !!codeSnippetOverride,
    hasMoreAffectedUrls,
    // "Valid for" applicability note for conditional schema checks
    // (undefined for checks that apply to every site).
    applicability,
    // Applicability decision from crawl evidence. "not_applicable" checks
    // render as "Not applicable — <reason>" instead of failing priority
    // items (excluded from ranking, quick wins, and the readiness score,
    // but kept visible so the analysis isn't suppressed).
    applicabilityStatus,
    applicabilityReason,
    // Pages that genuinely qualify for a conditional schema type (used by
    // the ranking to keep narrow checks below broad fixes).
    qualifiedPages,
    // Actionability fields (WHAT/WHY/WHERE/WHAT/HOW/VERIFY) from AEO_COPY
    implementationScope: copy.implementationScope,
    whyItMattersAi: copy.whyItMattersAi,
    whatToImplement: copy.whatToImplement,
    whereToImplement: copy.whereToImplement,
    implementationGuidance: copy.implementationGuidance,
    verificationSteps: copy.verificationSteps,
    // Consulting metadata (priority / difficulty / time / impact / business
    // outcome) — curated per check in AEO_META, category-aware fallback.
    ...metaForAeoCheck(key, category),
  };
}

export function buildAeoAuditResult(
  audit: RunAuditResult,
  botAccess: AeoBotAccessResult[],
  llmsTxt: { present: boolean; url: string },
  groupedIssues: GroupedIssue[]
): AeoAuditResult {
  const okPages = audit.crawl.pages.filter((p): p is PageWithAeo => p.ok);
  const pageCount = okPages.length;
  const pagesWithSignals = okPages.filter((p) => !!p.aeoSignals);
  const signalCount = pagesWithSignals.length;

  const checks: AeoCheck[] = [];

  // ===================== AI Crawlability =====================
  // The robots.txt directives are correct as-is for ANY site (no
  // site-specific placeholders), so they're passed as the override to mark
  // them ready-to-paste — the PDF and web both show them, keeping the two
  // surfaces consistent.
  for (const b of botAccess) {
    const copyKey = b.bot.toLowerCase() as keyof typeof AEO_COPY;
    // Build a richer status text when path-level analysis is available.
    let statusText: string;
    if (b.status === "blocked") {
      if (b.systemicBlock) {
        statusText = `${b.bot} is systemically blocked by robots.txt — this prevents AI crawlers from accessing public informational content.`;
      } else if (b.blockedPaths.length > 0) {
        statusText = `${b.bot} is partially blocked. Disallowed paths: ${b.blockedPaths.slice(0, 5).join(", ")}${b.blockedPaths.length > 5 ? ` and ${b.blockedPaths.length - 5} more` : ""}.`;
      } else {
        statusText = `${b.bot} is blocked by robots.txt.`;
      }
    } else if (b.status === "unknown") {
      statusText = `Could not determine ${b.bot}'s access — robots.txt could not be checked.`;
    } else {
      statusText = `${b.bot} is allowed to crawl this site.`;
      if (b.blockedPaths.length > 0) {
        statusText += ` Some paths are restricted: ${b.blockedPaths.slice(0, 3).join(", ")}${b.blockedPaths.length > 3 ? ` and ${b.blockedPaths.length - 3} more` : ""}.`;
      }
    }

    checks.push(
      makeCheck(
        `bot_${b.bot}`,
        `${b.bot} access`,
        "AI Crawlability",
        b.status !== "blocked",
        b.status === "blocked" ? 1 : 0,
        [],
        statusText,
        copyKey,
        AEO_COPY[copyKey].codeSnippet ?? null
      )
    );
  }

  checks.push(
    makeCheck(
      "llms_txt",
      "llms.txt file",
      "AI Crawlability",
      llmsTxt.present,
      llmsTxt.present ? 0 : 1,
      [],
      llmsTxt.present ? `Found at ${llmsTxt.url}.` : `No llms.txt found at ${llmsTxt.url}.`,
      "llms_txt"
    )
  );

  if (signalCount > 0) {
    const jsOnlyPages = pagesWithSignals.filter((p) => p.aeoSignals!.renderMode === "likely_js_only");
    // Text-to-HTML ratio: aggregate across pages for the status text.
    const avgRatio = pagesWithSignals.reduce((s, p) => s + (p.aeoSignals!.textToHtmlRatio ?? 0), 0) / signalCount;
    const lowRatioPages = pagesWithSignals.filter((p) => (p.aeoSignals!.textToHtmlRatio ?? 0) < 15);
    const totalSections = pagesWithSignals.reduce((s, p) => s + (p.aeoSignals!.sectionCount ?? 0), 0);

    const renderParts: string[] = [];
    if (jsOnlyPages.length === 0) {
      renderParts.push("Primary content is present in the raw HTML response across crawled pages.");
    } else {
      renderParts.push(`${jsOnlyPages.length} page${jsOnlyPages.length === 1 ? "" : "s"} render their primary content client-side — the raw HTML response contains an empty or near-empty content area.`);
    }
    // Append text-to-HTML ratio and semantic structure info.
    renderParts.push(`Average text-to-HTML ratio: ${avgRatio.toFixed(1)}%.`);
    if (lowRatioPages.length > 0 && lowRatioPages.length < signalCount) {
      renderParts.push(`${lowRatioPages.length} page${lowRatioPages.length === 1 ? "" : "s"} have a low text-to-HTML ratio (<15%), which may indicate excessive markup or script overhead.`);
    }
    if (totalSections > 0) {
      renderParts.push(`${totalSections} <section> semantic container${totalSections === 1 ? "" : "s"} found across crawled pages.`);
    }

    checks.push(
      makeCheck(
        "render_mode",
        "Primary content available in raw HTML",
        "AI Crawlability",
        jsOnlyPages.length === 0 && lowRatioPages.length === 0,
        jsOnlyPages.length + lowRatioPages.length,
        [...jsOnlyPages.map((p) => p.url), ...lowRatioPages.filter((p) => !jsOnlyPages.includes(p)).map((p) => p.url)],
        renderParts.join(" "),
        "render_mode"
      )
    );
  }

  // ===================== AI Structured Data =====================
  // Applicability-first: every conditional schema type (Product,
  // LocalBusiness, Article, FAQPage, Person) gets a crawl-evidence-based
  // applicability decision BEFORE priority is shown. "Not applicable"
  // checks render as "Not applicable — <reason>" and never enter the
  // Recommended Implementation Order / Quick Wins / readiness score.
  // Organization is always applicable but reported with entity/sitewide
  // scope (not a per-page affected count).
  const schemaTypePresent = (typeName: string) =>
    okPages.filter((p) => p.structuredData.present && p.structuredData.types.some((t) => t.toLowerCase() === typeName.toLowerCase()));
  const schemaApp = detectSchemaApplicability(audit);

  const orgPages = schemaTypePresent("Organization");
  // Tailor the copy-pasteable Organization JSON-LD to THIS site: real domain
  // + the entity name detected from the homepage title (first segment before
  // a | / - / — separator, same derivation the entity-consistency check
  // uses). Falls back to the hostname when no usable title exists. logo/sameAs
  // stay structural placeholders the client must fill — we never invent real
  // profile URLs.
  const orgSnippet = buildOrganizationJsonLd(okPages, audit.crawl.rootUrl);
  checks.push(
    makeCheck(
      "schema_organization",
      "Organization schema",
      "AI Structured Data",
      orgPages.length > 0,
      0,
      [],
      orgPages.length > 0
        ? `Found on ${orgPages.length} page${orgPages.length === 1 ? "" : "s"}.`
        : "Organization entity markup not detected sitewide. Organization schema describes the entity behind the whole site — it is normally implemented once (homepage or global template), not added to every page individually.",
      "schema_organization",
      orgSnippet,
      SCHEMA_APPLICABILITY.schema_organization,
      "applicable",
      "Applies to every organization, business, or entity behind a website — implemented once at the entity/site level."
    )
  );

  const localBizPages = schemaTypePresent("LocalBusiness");
  const localApp = schemaApp.schema_localbusiness;
  checks.push(
    makeCheck(
      "schema_localbusiness",
      "LocalBusiness schema",
      "AI Structured Data",
      localBizPages.length > 0,
      0,
      [],
      localBizPages.length > 0
        ? `Found on ${localBizPages.length} page${localBizPages.length === 1 ? "" : "s"}.`
        : localApp.status === "not_applicable"
        ? `Not applicable — ${localApp.reason}`
        : "Not found — only relevant if this business has a physical location or service area.",
      "schema_localbusiness",
      undefined,
      SCHEMA_APPLICABILITY.schema_localbusiness,
      localApp.status,
      localApp.status === "not_applicable" ? localApp.reason : undefined
    )
  );

  const personPages = schemaTypePresent("Person");
  const personApp = schemaApp.schema_person;
  // Real author byline captured from the crawl (meta author / rel=author /
  // itemprop=author) — the Person snippet only renders when a real name
  // exists; sameAs is never invented.
  const detectedAuthor =
    pagesWithSignals.map((p) => checkAuthorPresence(p).byline).find((n): n is string => !!n) ?? null;
  checks.push(
    makeCheck(
      "schema_person",
      "Person / Author schema",
      "AI Structured Data",
      personPages.length > 0,
      0,
      [],
      personPages.length > 0
        ? `Found on ${personPages.length} page${personPages.length === 1 ? "" : "s"}.`
        : personApp.status === "not_applicable"
        ? `Not applicable — ${personApp.reason}`
        : "Not found — most relevant for authored/editorial content.",
      "schema_person",
      detectedAuthor ? buildPersonJsonLd(detectedAuthor) : undefined,
      SCHEMA_APPLICABILITY.schema_person,
      personApp.status,
      personApp.status === "not_applicable" ? personApp.reason : undefined
    )
  );

  const articlePages = [...schemaTypePresent("Article"), ...schemaTypePresent("BlogPosting")];
  const articleApp = schemaApp.schema_article;
  // The Article snippet is built from a REAL blog/article page (headline +
  // URL from the crawl; author included only when detected) — never from
  // placeholder data.
  const articleExamplePage = okPages.find((p) => {
    const t = classifyPageType(p);
    return t === "blog" || t === "article";
  });
  checks.push(
    makeCheck(
      "schema_article",
      "Article / BlogPosting schema",
      "AI Structured Data",
      articlePages.length > 0,
      0,
      [],
      articlePages.length > 0
        ? `Found on ${articlePages.length} page${articlePages.length === 1 ? "" : "s"}.`
        : articleApp.status === "not_applicable"
        ? `Not applicable — ${articleApp.reason}`
        : "Not found — most relevant for blog/article content.",
      "schema_article",
      articleExamplePage ? buildArticleJsonLd(articleExamplePage, entityNameForSite(okPages, audit.crawl.rootUrl)) : undefined,
      SCHEMA_APPLICABILITY.schema_article,
      articleApp.status,
      articleApp.status === "not_applicable" ? articleApp.reason : undefined
    )
  );

  // FAQPage — ranked by the ACTUAL number of qualifying pages (pages with
  // genuine Q&A content), never as a flat sitewide priority. If only a
  // handful of pages qualify, the effective priority is stepped down so it
  // can't outrank fixes affecting the whole site.
  const faqPages = pagesWithSignals.filter((p) => p.aeoSignals!.faqSchemaPresent);
  const faqQualifyingPages = pagesWithSignals.filter((p) => p.aeoSignals!.questionHeadingCount >= 2);
  const faqApp = schemaApp.schema_faq;
  // The FAQPage snippet is built from REAL question/answer pairs captured
  // from the client's qualifying pages (null when fewer than two real pairs
  // exist — never a fabricated placeholder).
  const faqSnippet = buildFaqJsonLd(faqQualifyingPages, audit.crawl.rootUrl);
  checks.push(
    makeCheck(
      "schema_faq",
      "FAQPage schema",
      "AI Structured Data",
      faqPages.length > 0,
      faqApp.status === "not_applicable" || faqPages.length > 0 ? 0 : faqQualifyingPages.length,
      faqApp.status === "not_applicable" || faqPages.length > 0 ? [] : faqQualifyingPages.map((p) => p.url),
      faqPages.length > 0
        ? `Found on ${faqPages.length} page${faqPages.length === 1 ? "" : "s"}.`
        : faqApp.status === "not_applicable"
        ? `Not applicable — ${faqApp.reason}`
        : faqQualifyingPages.length > 0
        ? `${faqQualifyingPages.length} page${faqQualifyingPages.length === 1 ? "" : "s"} contain genuine Q&A content (question headings) without FAQ markup.`
        : "Not found on any crawled page.",
      "schema_faq",
      faqSnippet ?? undefined,
      SCHEMA_APPLICABILITY.schema_faq,
      faqApp.status,
      faqApp.status === "not_applicable" ? faqApp.reason : undefined,
      faqQualifyingPages.length
    )
  );

  const breadcrumbPages = schemaTypePresent("BreadcrumbList");
  const missingBreadcrumbPages = okPages.filter(
    (p) => !(p.structuredData.present && p.structuredData.types.some((t) => t.toLowerCase() === "breadcrumblist"))
  );
  checks.push(
    makeCheck(
      "schema_breadcrumb",
      "Breadcrumb schema",
      "AI Structured Data",
      breadcrumbPages.length > 0,
      missingBreadcrumbPages.length,
      missingBreadcrumbPages.map((p) => p.url),
      breadcrumbPages.length > 0 ? `Found on ${breadcrumbPages.length} page${breadcrumbPages.length === 1 ? "" : "s"}.` : "Not found on any crawled page.",
      "schema_breadcrumb",
      // Built from a REAL affected page URL's path — each breadcrumb item is
      // a real page on this site, never invented.
      missingBreadcrumbPages.length > 0
        ? buildBreadcrumbJsonLd(missingBreadcrumbPages[0].url, audit.crawl.rootUrl)
        : undefined
    )
  );

  const productPages = schemaTypePresent("Product");
  const productApp = schemaApp.schema_product;
  // The Product snippet is built from a REAL product page (name/url from
  // the crawl; price/availability omitted — never invented).
  const productExamplePage = okPages.find((p) => classifyPageType(p) === "product");
  checks.push(
    makeCheck(
      "schema_product",
      "Product schema",
      "AI Structured Data",
      productPages.length > 0,
      0,
      [],
      productPages.length > 0
        ? `Found on ${productPages.length} page${productPages.length === 1 ? "" : "s"}.`
        : productApp.status === "not_applicable"
        ? `Not applicable — ${productApp.reason}`
        : "Not found — only relevant for e-commerce/product pages.",
      "schema_product",
      productExamplePage ? buildProductJsonLd(productExamplePage, entityNameForSite(okPages, audit.crawl.rootUrl)) : undefined,
      SCHEMA_APPLICABILITY.schema_product,
      productApp.status,
      productApp.status === "not_applicable" ? productApp.reason : undefined
    )
  );

  const sameAsPages = pagesWithSignals.filter((p) => p.aeoSignals!.sameAsLinks.length > 0);
  // Collect all unique sameAs URLs and validate them.
  const allSameAsUrls = [...new Set(pagesWithSignals.flatMap((p) => p.aeoSignals!.sameAsLinks))];
  const validSameAsUrls = allSameAsUrls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
  // Check for credible sameAs links (not just the site's own domain).
  const rootHost = (() => { try { return new URL(audit.crawl.rootUrl).hostname; } catch { return ""; } })();
  const externalSameAs = validSameAsUrls.filter((url) => {
    try { return new URL(url).hostname !== rootHost; } catch { return false; }
  });
  const sameAsStatus = sameAsPages.length === 0
    ? "Not found on any crawled page."
    : externalSameAs.length > 0
    ? `Found on ${sameAsPages.length} page${sameAsPages.length === 1 ? "" : "s"} with ${externalSameAs.length} validated external profile link${externalSameAs.length === 1 ? "" : "s"} (e.g. LinkedIn, Wikipedia, Crunchbase).`
    : allSameAsUrls.length > 0
    ? `Found on ${sameAsPages.length} page${sameAsPages.length === 1 ? "" : "s"}, but all sameAs links point to the site's own domain — adding external profile links (social platforms, Wikipedia/Wikidata, official directories) strengthens entity verification.`
    : `Found on ${sameAsPages.length} page${sameAsPages.length === 1 ? "" : "s"}.`;
  checks.push(
    makeCheck(
      "schema_sameas",
      "sameAs social profile links",
      "AI Structured Data",
      sameAsPages.length > 0 && externalSameAs.length > 0,
      sameAsPages.length === 0 ? 0 : (externalSameAs.length === 0 ? 1 : 0),
      [],
      sameAsStatus,
      "schema_sameas"
    )
  );

  // ===================== AI Answer Readiness =====================
  if (signalCount > 0) {
    const withQuestionHeadings = pagesWithSignals.filter((p) => p.aeoSignals!.questionHeadingCount > 0);
    // 45-word rule: a question passes when its immediate answer is 45 words
    // or fewer (concise and direct). Count words across all captured Q&A pairs.
    let totalQuestions = 0;
    let conciseAnswerCount = 0;
    for (const p of pagesWithSignals) {
      for (const qa of p.aeoSignals!.questionHeadings) {
        totalQuestions++;
        const wordCount = qa.answer.split(/\s+/).filter(Boolean).length;
        if (wordCount <= 45) conciseAnswerCount++;
      }
    }
    const withAnsweredQuestions = pagesWithSignals.filter(
      (p) => p.aeoSignals!.questionHeadingCount > 0 && p.aeoSignals!.questionHeadingsWithDirectAnswer === p.aeoSignals!.questionHeadingCount
    );
    const unansweredQuestionPages = pagesWithSignals.filter(
      (p) => p.aeoSignals!.questionHeadingCount > 0 && p.aeoSignals!.questionHeadingsWithDirectAnswer < p.aeoSignals!.questionHeadingCount
    );
    checks.push(
      makeCheck(
        "question_headings",
        "Question-based headings with direct answers",
        "AI Answer Readiness",
        withQuestionHeadings.length > 0 && withAnsweredQuestions.length === withQuestionHeadings.length,
        unansweredQuestionPages.length,
        unansweredQuestionPages.map((p) => p.url),
        withQuestionHeadings.length === 0
          ? "No question-phrased headings found across crawled pages."
          : `${withAnsweredQuestions.length} of ${withQuestionHeadings.length} page${withQuestionHeadings.length === 1 ? "" : "s"} with question headings have a direct answer immediately following every one. ${totalQuestions > 0 ? `${conciseAnswerCount} of ${totalQuestions} question${totalQuestions === 1 ? "" : "s"} have a concise answer (45 words or fewer) — ideal for AI answer extraction.` : ""}`,
        "question_headings"
      )
    );

    const withStructure = pagesWithSignals.filter(
      (p) => p.aeoSignals!.hasOrderedList || p.aeoSignals!.hasUnorderedList || p.aeoSignals!.hasTable
    );
    const noStructurePages = pagesWithSignals.filter(
      (p) => !p.aeoSignals!.hasOrderedList && !p.aeoSignals!.hasUnorderedList && !p.aeoSignals!.hasTable
    );
    checks.push(
      makeCheck(
        "lists_tables",
        "Lists and tables for structured content",
        "AI Answer Readiness",
        pct(withStructure.length, signalCount) >= 50,
        noStructurePages.length,
        noStructurePages.map((p) => p.url),
        `${withStructure.length} of ${signalCount} crawled page${signalCount === 1 ? "" : "s"} (${pct(withStructure.length, signalCount)}%) use at least one list or table.`,
        "lists_tables"
      )
    );

    const validHierarchy = pagesWithSignals.filter((p) => p.aeoSignals!.headingHierarchyValid);
    checks.push(
      makeCheck(
        "heading_hierarchy",
        "Proper heading hierarchy (H1 → H2 → H3)",
        "AI Answer Readiness",
        validHierarchy.length === signalCount,
        signalCount - validHierarchy.length,
        pagesWithSignals.filter((p) => !p.aeoSignals!.headingHierarchyValid).map((p) => p.url),
        validHierarchy.length === signalCount
          ? "Heading levels descend cleanly (no skipped levels) across crawled pages."
          : `${signalCount - validHierarchy.length} page${signalCount - validHierarchy.length === 1 ? "" : "s"} skip a heading level (e.g. H2 straight to H4).`,
        "heading_hierarchy"
      )
    );
  }

  // ===================== Trust & Entity Signals =====================
  // Shared definition: checkAuthorPresence() — the SAME helper the AI
  // Citation Readiness section uses, so the two sections can never report
  // contradictory author numbers again. This check measures the
  // machine-readable author byline only (meta author / rel=author /
  // itemprop=author); profile-page links and Person schema are counted
  // separately in the Citation Readiness section.
  if (signalCount > 0) {
    const withAuthor = pagesWithSignals.filter((p) => checkAuthorPresence(p).byline !== null);
    // Enhanced: also count visible bylines and author URLs for richer status text.
    const withVisibleAuthor = pagesWithSignals.filter((p) => p.aeoSignals!.visibleAuthor);
    const withAuthorUrl = pagesWithSignals.filter((p) => !!p.aeoSignals!.authorUrl);
    checks.push(
      makeCheck(
        "author_name",
        "Author name (machine-readable)",
        "Trust & Entity Signals",
        pct(withAuthor.length, signalCount) >= 50,
        signalCount - withAuthor.length,
        pagesWithSignals.filter((p) => checkAuthorPresence(p).byline === null).map((p) => p.url),
        (() => {
          const parts: string[] = [];
          parts.push(`${withAuthor.length} of ${signalCount} page${signalCount === 1 ? "" : "s"} expose a machine-readable author name (meta author, rel=author, or itemprop=author).`);
          if (withVisibleAuthor.length > 0) {
            parts.push(`${withVisibleAuthor.length} page${withVisibleAuthor.length === 1 ? "" : "s"} also show a visible byline ("By …").`);
          }
          if (withAuthorUrl.length > 0) {
            parts.push(`${withAuthorUrl.length} page${withAuthorUrl.length === 1 ? "" : "s"} include an author profile URL.`);
          }
          if (withAuthor.length === 0 && withVisibleAuthor.length === 0) {
            parts.push("No machine-readable or visible author bylines found — verify manually if you believe authors are shown on the page.");
          }
          return parts.join(" ");
        })(),
        "author_name"
      )
    );

    const withDate = pagesWithSignals.filter((p) => !!p.aeoSignals!.lastUpdatedDate);
    const missingDatePages = pagesWithSignals.filter((p) => !p.aeoSignals!.lastUpdatedDate);
    // Enhanced: also count datePublished for richer status text.
    const withPublished = pagesWithSignals.filter((p) => !!p.aeoSignals!.datePublished);
    checks.push(
      makeCheck(
        "last_updated",
        "Last updated date",
        "Trust & Entity Signals",
        pct(withDate.length, signalCount) >= 50,
        missingDatePages.length,
        missingDatePages.map((p) => p.url),
        (() => {
          const parts: string[] = [];
          parts.push(`${withDate.length} of ${signalCount} page${signalCount === 1 ? "" : "s"} expose a last-updated date.`);
          if (withPublished.length > 0) {
            parts.push(`${withPublished.length} page${withPublished.length === 1 ? "" : "s"} also include a datePublished signal.`);
          }
          if (withDate.length === 0 && withPublished.length === 0) {
            parts.push("No machine-readable publish or update dates found across crawled pages.");
          }
          return parts.join(" ");
        })(),
        "last_updated"
      )
    );

    const withContact = pagesWithSignals.filter((p) => p.aeoSignals!.hasContactInfo);
    checks.push(
      makeCheck(
        "contact_info",
        "Contact information findable",
        "Trust & Entity Signals",
        withContact.length > 0,
        withContact.length > 0 ? 0 : 1,
        [],
        withContact.length > 0
          ? `Contact information (phone, email, or contact link) found on ${withContact.length} page${withContact.length === 1 ? "" : "s"}.`
          : "No phone number, email, or contact link found on any crawled page.",
        "contact_info"
      )
    );

    const withAbout = pagesWithSignals.filter((p) => p.aeoSignals!.linksToAboutPage);
    checks.push(
      makeCheck(
        "about_page",
        "About page linked",
        "Trust & Entity Signals",
        withAbout.length > 0,
        withAbout.length > 0 ? 0 : 1,
        [],
        withAbout.length > 0 ? "An About page is linked from at least one crawled page." : "No link to an About page found.",
        "about_page"
      )
    );

    const avgDensity = pagesWithSignals.reduce((s, p) => s + p.aeoSignals!.numericDataDensityPct, 0) / signalCount;
    const lowDensityPages = pagesWithSignals.filter((p) => p.aeoSignals!.numericDataDensityPct < 2);
    checks.push(
      makeCheck(
        "numeric_density",
        "Numeric data density (stats, dates, prices)",
        "Trust & Entity Signals",
        avgDensity >= 2,
        lowDensityPages.length,
        lowDensityPages.map((p) => p.url),
        `Roughly ${avgDensity.toFixed(1)}% of words across crawled pages look numeric/stat-like.`,
        "numeric_density"
      )
    );
  }

  const orgNames = new Set(
    okPages
      .filter((p) => p.structuredData.present)
      .map((p) => (p.title.content ? p.title.content.split(/[|\-–—]/)[0].trim().toLowerCase() : null))
      .filter((n): n is string => !!n)
  );
  checks.push(
    makeCheck(
      "entity_consistency",
      "Organization / entity name consistency",
      "Trust & Entity Signals",
      orgNames.size <= 1,
      orgNames.size > 1 ? orgNames.size : 0,
      [],
      orgNames.size <= 1
        ? "Brand/organization naming looks consistent across crawled pages' title tags."
        : `Found ${orgNames.size} different name variants in title tags across crawled pages — worth checking these all refer to the same entity consistently.`,
      "entity_consistency"
    )
  );

  // ===================== Content Quality Signals =====================
  // Thin content: moved here from the main Issues by Type / Content
  // section per product request. Detection logic is UNCHANGED (still the
  // `thin_content` flag from crawlPage.ts / templates.ts) — only where
  // it's rendered has moved.
  const thinContentGroup = groupedIssues.find((g) => g.flag === "thin_content");
  if (thinContentGroup) {
    const thinUrls = thinContentGroup.instances.map((i) => i.url);
    const hasMoreThinUrls = thinUrls.length > 5;
    checks.push({
      key: "thin_content_aeo",
      label: thinContentGroup.issueLabel,
      category: "Content Quality Signals",
      passed: false,
      affectedCount: thinContentGroup.instances.length,
      affectedUrls: thinUrls,
      statusText: `${thinContentGroup.instances.length} page${thinContentGroup.instances.length === 1 ? "" : "s"} affected.${
        hasMoreThinUrls ? " The complete list of affected URLs is available in the CSV export." : ""
      }`,
      whyItMatters: thinContentGroup.whyItMatters,
      recommendedFix: thinContentGroup.recommendedFix,
      codeSnippet: null,
      hasMoreAffectedUrls: hasMoreThinUrls,
      ...metaForAeoCheck("thin_content_aeo", "Content Quality Signals"),
    });
  } else if (pageCount > 0) {
    checks.push({
      key: "thin_content_aeo",
      label: "Thin content",
      category: "Content Quality Signals",
      passed: true,
      affectedCount: 0,
      affectedUrls: [],
      statusText: "No thin-content pages found.",
      whyItMatters:
        "Pages with very little text give AI systems little substance to draw from when composing an answer that cites this page.",
      recommendedFix: "",
      codeSnippet: null,
      hasMoreAffectedUrls: false,
      ...metaForAeoCheck("thin_content_aeo", "Content Quality Signals"),
    });
  }

  if (signalCount > 0) {
    // Semantic Density & Entity Alignment — a heuristic on how the page's
    // opening content reads to an AI parser. AI engines don't scan for
    // keyword repetitions; they parse text into entities and cross-reference
    // them, so pages that open with clear definitional statements ("What
    // is…", "How to…", "X is a…") are far easier to contextualize. Gate:
    // 2+ definitional statements in the first content paragraphs, or a
    // definitional opening (first heading/paragraph) — conservative so a
    // single marketing-style headline can't pass a page on its own. An audit
    // crawled before this signal existed simply lacks the field on its
    // aeoSignals, so the check is skipped entirely (never a false failure).
    const semanticDensityMeasured = pagesWithSignals.some(
      (p) => "definitionalStatementCount" in (p.aeoSignals as object)
    );
    if (semanticDensityMeasured) {
      const withDefinitionalStructure = pagesWithSignals.filter(
        (p) =>
          (p.aeoSignals!.definitionalStatementCount ?? 0) >= 2 || (p.aeoSignals!.hasDefinitionalOpening ?? false)
      );
      const missingDefinitionalPages = pagesWithSignals.filter(
        (p) =>
          !((p.aeoSignals!.definitionalStatementCount ?? 0) >= 2 || (p.aeoSignals!.hasDefinitionalOpening ?? false))
      );
      checks.push(
        makeCheck(
          "semantic_density",
          "Semantic density & entity alignment",
          "Content Quality Signals",
          pct(withDefinitionalStructure.length, signalCount) >= 50,
          missingDefinitionalPages.length,
          missingDefinitionalPages.map((p) => p.url),
          `${withDefinitionalStructure.length} of ${signalCount} page${signalCount === 1 ? "" : "s"} (${pct(
            withDefinitionalStructure.length,
            signalCount
          )}%) open with clear definitional statements ("What is…", "How to…", "X is a…") that map the page's primary entities. This is a heuristic based on opening paragraphs and headings — verify manually before treating it as certain.`,
          "semantic_density"
        )
      );
    }

    const fingerprintCounts = new Map<string, string[]>();
    for (const p of pagesWithSignals) {
      const fp = p.aeoSignals!.contentFingerprint;
      if (!fp) continue;
      const list = fingerprintCounts.get(fp) ?? [];
      list.push(p.url);
      fingerprintCounts.set(fp, list);
    }
    const duplicateGroups = Array.from(fingerprintCounts.values()).filter((urls) => urls.length > 1);
    const duplicateUrlCount = duplicateGroups.reduce((s, g) => s + g.length, 0);
    checks.push(
      makeCheck(
        "duplicate_content_aeo",
        "Duplicate content (AEO)",
        "Content Quality Signals",
        duplicateGroups.length === 0,
        duplicateUrlCount,
        duplicateGroups.flat(),
        duplicateGroups.length === 0
          ? "No near-identical pages detected (exact-match check only — not a substitute for a full similarity analysis)."
          : `${duplicateGroups.length} group${duplicateGroups.length === 1 ? "" : "s"} of pages (${duplicateUrlCount} URLs total) share near-identical visible content.`,
        "duplicate_content_aeo",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "URLs"
      )
    );

    const faqOpportunity = pagesWithSignals.filter(
      (p) => p.aeoSignals!.questionHeadingCount >= 2 && !p.aeoSignals!.faqSchemaPresent
    );
    checks.push(
      makeCheck(
        "missing_faq_opportunity",
        "Missing FAQ opportunities",
        "Content Quality Signals",
        faqOpportunity.length === 0,
        faqOpportunity.length,
        faqOpportunity.map((p) => p.url),
        faqOpportunity.length === 0
          ? "No obvious missed FAQ opportunities found."
          : `${faqOpportunity.length} page${faqOpportunity.length === 1 ? "" : "s"} already answer multiple questions in prose but aren't marked up as FAQPage.`,
        "missing_faq_opportunity"
      )
    );

    const longPagesMissingTldr = pagesWithSignals.filter((p) => p.wordCount >= 800 && !p.aeoSignals!.tldrPresent);
    checks.push(
      makeCheck(
        "missing_tldr",
        "Missing summary / TL;DR section",
        "Content Quality Signals",
        longPagesMissingTldr.length === 0,
        longPagesMissingTldr.length,
        longPagesMissingTldr.map((p) => p.url),
        longPagesMissingTldr.length === 0
          ? "Long-form pages either have a summary section or none qualify (under ~800 words)."
          : `${longPagesMissingTldr.length} long-form page${longPagesMissingTldr.length === 1 ? "" : "s"} (800+ words) have no summary/TL;DR section near the top.`,
        "missing_tldr"
      )
    );

    const noInternalLinks = okPages.filter((p) => p.flags.includes("no_internal_links"));
    checks.push(
      makeCheck(
        "internal_links_related",
        "Internal links to related content",
        "Content Quality Signals",
        noInternalLinks.length === 0,
        noInternalLinks.length,
        noInternalLinks.map((p) => p.url),
        noInternalLinks.length === 0
          ? "Every crawled page links to other related content on the site."
          : `${noInternalLinks.length} page${noInternalLinks.length === 1 ? "" : "s"} have no internal links at all.`,
        "internal_links_related"
      )
    );

    const noExternalAuthority = pagesWithSignals.filter((p) => p.wordCount >= 300 && p.aeoSignals!.externalAuthorityLinkCount === 0);
    checks.push(
      makeCheck(
        "external_authority_links",
        "External links to authoritative sources",
        "Content Quality Signals",
        pct(noExternalAuthority.length, signalCount) < 50,
        noExternalAuthority.length,
        noExternalAuthority.map((p) => p.url),
        `${signalCount - noExternalAuthority.length} of ${signalCount} substantive page${signalCount === 1 ? "" : "s"} link out to at least one external source.`,
        "external_authority_links"
      )
    );
  }

  // ===================== AI Technical Readiness =====================
  // Reframes checks that already exist elsewhere in the report — no new
  // detection logic, just AEO-specific copy. Counts pulled straight from
  // already-computed audit data so this can never disagree with the
  // primary sections.
  const noindexPages = okPages.filter((p) => p.flags.includes("noindex_meta_tag") || p.flags.includes("noindex_x_robots_tag"));
  checks.push(
    makeCheck(
      "indexability_aeo",
      "Indexability",
      "AI Technical Readiness",
      noindexPages.length === 0,
      noindexPages.length,
      noindexPages.map((p) => p.url),
      noindexPages.length === 0 ? "No unintended indexing blocks found." : `${noindexPages.length} page${noindexPages.length === 1 ? "" : "s"} are blocked from indexing.`,
      "indexability_aeo"
    )
  );

  const canonicalIssuePages = okPages.filter((p) => p.flags.includes("missing_canonical") || p.flags.includes("canonical_mismatch"));
  checks.push(
    makeCheck(
      "canonicals_aeo",
      "Canonicals",
      "AI Technical Readiness",
      canonicalIssuePages.length === 0,
      canonicalIssuePages.length,
      canonicalIssuePages.map((p) => p.url),
      canonicalIssuePages.length === 0 ? "Canonical tags look correct across crawled pages." : `${canonicalIssuePages.length} page${canonicalIssuePages.length === 1 ? "" : "s"} have a missing or mismatched canonical.`,
      "canonicals_aeo"
    )
  );

  const robotsSitemapOk = audit.crawl.robotsAudit.status !== "fetch_error" && audit.crawl.sitemapAudit.status === "found";
  checks.push(
    makeCheck(
      "robots_sitemap_aeo",
      "Robots.txt & XML sitemap",
      "AI Technical Readiness",
      robotsSitemapOk,
      robotsSitemapOk ? 0 : 1,
      [],
      robotsSitemapOk
        ? "robots.txt is reachable and a sitemap.xml was found."
        : "robots.txt and/or sitemap.xml has an issue — see the dedicated sections above.",
      "robots_sitemap_aeo"
    )
  );

  const excessiveRedirectChains = audit.crawl.redirectChains.filter((r) => r.excessive);
  checks.push(
    makeCheck(
      "redirect_chains_aeo",
      "Redirect chains",
      "AI Technical Readiness",
      excessiveRedirectChains.length === 0,
      excessiveRedirectChains.length,
      excessiveRedirectChains.map((r) => r.originalUrl),
      excessiveRedirectChains.length === 0 ? "No excessive redirect chains found." : `${excessiveRedirectChains.length} excessive redirect chain${excessiveRedirectChains.length === 1 ? "" : "s"} found.`,
      "redirect_chains_aeo",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "chains"
    )
  );

  // Render-time safety net: even if the shared genuineBrokenLinks helper
  // already excludes Cloudflare email-obfuscation URLs, apply the same
  // filter here so stale cached audits never surface cdn-cgi/l/ false
  // positives in the AEO section.
  const brokenLinksFound = genuineBrokenLinks(audit.brokenLinks).filter(
    (l) => !isCloudflareEmailObfuscation(l.url)
  );
  checks.push(
    makeCheck(
      "broken_links_aeo",
      "Broken links",
      "AI Technical Readiness",
      brokenLinksFound.length === 0,
      brokenLinksFound.length,
      brokenLinksFound.map((b) => b.url),
      brokenLinksFound.length === 0 ? "No broken links found." : `${brokenLinksFound.length} broken link${brokenLinksFound.length === 1 ? "" : "s"} found.`,
      "broken_links_aeo",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "links"
    )
  );

  const cwv = resolveCoreWebVitals(audit);
  if (cwv.evaluatedPages > 0) {
    const vitalsOk = cwv.failingPages === 0;
    const worstUrlsDeduped = [...new Set(cwv.worstUrls.map((w) => w.url))].slice(0, 5);
    checks.push(
      makeCheck(
        "core_web_vitals_aeo",
        "Core Web Vitals",
        "AI Technical Readiness",
        vitalsOk,
        vitalsOk ? 0 : cwv.failingPages,
        worstUrlsDeduped,
        vitalsOk
          ? `${cwv.passingPages} of ${cwv.evaluatedPages} evaluated pages pass Core Web Vitals (every measurable LCP/INP/CLS in the good range).`
          : `${cwv.failingPages} of ${cwv.evaluatedPages} evaluated pages fall short on Core Web Vitals (at least one vital not in the good range).`,
        "core_web_vitals_aeo"
      )
    );
  }

  // NOTE: meta_title_aeo, meta_description_aeo, and alt_text_aeo were removed
  // from this AEO section — they are traditional On-Page SEO checks whose
  // canonical category is On-Page SEO (titles, descriptions, images). They
  // now appear ONLY in the On-Page SEO section of the report and contribute
  // ONLY to the On-Page SEO pillar score. The AEO/GEO section focuses on
  // genuinely AI-search-related checks (AI crawlability, structured data,
  // entity signals, content quality for AI retrieval).

  if (signalCount > 0) {
    const missingOg = pagesWithSignals.filter((p) => !p.aeoSignals!.ogTags.present);
    checks.push(
      makeCheck(
        "og_tags",
        "Open Graph tags",
        "AI Technical Readiness",
        missingOg.length === 0,
        missingOg.length,
        missingOg.map((p) => p.url),
        missingOg.length === 0 ? "Open Graph tags are complete across crawled pages." : `${missingOg.length} page${missingOg.length === 1 ? "" : "s"} are missing one or more required Open Graph tags.`,
        "og_tags"
      )
    );

    const missingTwitter = pagesWithSignals.filter((p) => !p.aeoSignals!.twitterCardTags.present);
    checks.push(
      makeCheck(
        "twitter_card_tags",
        "Twitter Card tags",
        "AI Technical Readiness",
        missingTwitter.length === 0,
        missingTwitter.length,
        missingTwitter.map((p) => p.url),
        missingTwitter.length === 0 ? "Twitter Card tags are complete across crawled pages." : `${missingTwitter.length} page${missingTwitter.length === 1 ? "" : "s"} are missing one or more required Twitter Card tags.`,
        "twitter_card_tags"
      )
    );
  }

  return { botAccess, llmsTxt, checks };
}

/**
 * The entity name behind the audited site: first segment of the homepage
 * title (before | / - / — separators, matching the entity-consistency
 * check's derivation), falling back to the bare hostname. Shared by every
 * site-specific JSON-LD builder below so all snippets agree on the name.
 */
function entityNameForSite(okPages: PageWithAeo[], rootUrl: string): string {
  let rootHost = "";
  try {
    rootHost = new URL(rootUrl).hostname;
  } catch {
    rootHost = rootUrl;
  }
  const homepage = okPages.find((p) => {
    try {
      return new URL(p.url).pathname === "/";
    } catch {
      return false;
    }
  });
  const rawTitle = homepage?.title.content ?? "";
  const firstSegment = rawTitle.split(/[|\-–—]/)[0].trim();
  return firstSegment.length >= 2 && firstSegment.toLowerCase() !== "home"
    ? firstSegment
    : rootHost.replace(/^www\./, "");
}

/** Escapes a value for safe inclusion inside a double-quoted JSON string. */
function jsonEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/\t/g, "\\t");
}

/** First path segment of a page URL used as a readable fallback name. */
function titleFallback(url: string): string {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    if (segs.length === 0) return "Home";
    return decodeURIComponent(segs[segs.length - 1]).replace(/[-_]+/g, " ").replace(/\.[a-z0-9]+$/i, "").trim() || "Page";
  } catch {
    return "Page";
  }
}

/**
 * Builds a copy-pasteable Organization JSON-LD block tailored to the
 * audited site — real domain and the entity name detected from the homepage
 * title, with the site's hostname as the fallback name. logo/sameAs remain
 * clearly-marked placeholders: we never fabricate profile URLs or asset
 * paths the crawler didn't verify.
 */
function buildOrganizationJsonLd(
  okPages: PageWithAeo[],
  rootUrl: string
): { label: string; code: string } {
  let rootHost = "";
  try {
    rootHost = new URL(rootUrl).hostname;
  } catch {
    rootHost = rootUrl;
  }
  const entityName = entityNameForSite(okPages, rootUrl);

  const code = `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${jsonEscape(entityName)}",\n  "url": "https://${rootHost}",\n  "logo": "https://${rootHost}/logo.png",\n  "sameAs": []\n}\n</script>`;

  return { label: "JSON-LD (add inside <head>)", code };
}

/**
 * Builds a copy-pasteable FAQPage JSON-LD block from REAL question/answer
 * pairs captured from the client's own pages (question headings with a
 * substantive following paragraph). Nothing is fabricated: only pages with
 * genuine detected Q&A content contribute, and answers are the site's own
 * sentences. Returns null when fewer than two real pairs exist.
 */
function buildFaqJsonLd(
  qualifyingPages: PageWithAeo[],
  rootUrl: string
): { label: string; code: string } | null {
  // Capped at 4 real pairs (within the 3–5 spec): enough to show the
  // pattern without producing a code block that dominates the card. The
  // snippet renders full-width in the PDF, so long answer lines don't wrap
  // into 2–3 half-column lines and the block paginates safely.
  const pairs: { question: string; answer: string }[] = [];
  for (const p of qualifyingPages) {
    for (const h of p.aeoSignals?.questionHeadings ?? []) {
      if (pairs.length >= 4) break;
      pairs.push(h);
    }
    if (pairs.length >= 4) break;
  }
  if (pairs.length < 2) return null;

  const items = pairs
    .map(
      (pair, i) =>
        `    {\n      "@type": "Question",\n      "name": "${jsonEscape(pair.question)}",\n      "acceptedAnswer": { "@type": "Answer", "text": "${jsonEscape(pair.answer)}" }\n    }${i < pairs.length - 1 ? "," : ""}`
    )
    .join("\n");
  const code = `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [\n${items}\n  ]\n}\n</script>`;
  return { label: "JSON-LD (add inside <head>)", code };
}

/**
 * Builds a copy-pasteable BreadcrumbList JSON-LD block from a real affected
 * page URL — each breadcrumb item is a real page on this site, derived from
 * the URL's path (never invented).
 */
function buildBreadcrumbJsonLd(affectedUrl: string, rootUrl: string): { label: string; code: string } {
  let url: URL;
  try {
    url = new URL(affectedUrl);
  } catch {
    url = new URL(rootUrl);
  }
  const segments = url.pathname.split("/").filter(Boolean).slice(0, 3);
  const items = [
    { position: 1, name: "Home", item: `${url.origin}/` },
    ...segments.map((seg, i) => {
      const acc = `${url.origin}/${segments.slice(0, i + 1).join("/")}`;
      const name = decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.[a-z0-9]+$/i, "");
      const pretty =
        name.charAt(0).toUpperCase() + name.slice(1) || seg;
      return { position: i + 2, name: pretty, item: acc };
    }),
  ];
  const rows = items
    .map(
      (it, i) =>
        `    { "@type": "ListItem", "position": ${it.position}, "name": "${jsonEscape(it.name)}", "item": "${jsonEscape(it.item)}" }${i < items.length - 1 ? "," : ""}`
    )
    .join("\n");
  const code = `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "BreadcrumbList",\n  "itemListElement": [\n${rows}\n  ]\n}\n</script>`;
  return { label: "JSON-LD (add inside <head>)", code };
}

/**
 * Builds a copy-pasteable Product JSON-LD block for a real product page.
 * Only name/url/brand are included — price, availability, and ratings are
 * never invented, so they're simply omitted (add them once real values
 * exist).
 */
function buildProductJsonLd(page: PageWithAeo, entityName: string): { label: string; code: string } {
  const titleSeg = (page.title.content || "").split(/[|\-–—]/)[0].trim();
  const name = titleSeg.length >= 2 ? titleSeg : titleFallback(page.url);
  const code = `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "${jsonEscape(name)}",\n  "url": "${jsonEscape(page.url)}",\n  "brand": { "@type": "Brand", "name": "${jsonEscape(entityName)}" }\n}\n</script>`;
  return { label: "JSON-LD (add inside <head>)", code };
}

/**
 * Builds a copy-pasteable Article/BlogPosting JSON-LD block for a real
 * blog/article page — headline and URL come from the crawled page; author
 * is included only when a machine-readable author name was detected.
 * datePublished is omitted when the audit couldn't detect one (never
 * invented).
 */
function buildArticleJsonLd(page: PageWithAeo, entityName: string): { label: string; code: string } {
  const headline = (page.title.content || "").trim() || titleFallback(page.url);
  const author = page.aeoSignals?.authorName ?? null;
  const authorLine = author
    ? `  "author": { "@type": "Person", "name": "${jsonEscape(author)}" },\n`
    : "";
  const code = `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "BlogPosting",\n  "headline": "${jsonEscape(headline)}",\n${authorLine}  "url": "${jsonEscape(page.url)}",\n  "publisher": { "@type": "Organization", "name": "${jsonEscape(entityName)}" }\n}\n</script>`;
  return { label: "JSON-LD (add inside <head>)", code };
}

/**
 * Builds a copy-pasteable Person JSON-LD block for a detected author. The
 * name is the real machine-readable author byline from the crawl; sameAs
 * is omitted (never invented) — add verified profile links once they exist.
 */
function buildPersonJsonLd(authorName: string): { label: string; code: string } {
  const code = `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Person",\n  "name": "${jsonEscape(authorName)}"\n}\n</script>`;
  return { label: "JSON-LD (add inside <head>)", code };
}

// ---------------------------------------------------------------------------
// AI Citation Readiness — a dedicated trust/provenance assessment, separate
// from the pass/fail AEO checks above. These are the signals AI answer
// engines (and users deciding whether to trust a citation) look for before
// treating a site as a citable source.
// ---------------------------------------------------------------------------

const CITATION_CHECK_LIMIT = 25; // cap on affected-URL samples shown per check

function countWithSignal(
  pages: PageWithAeo[],
  pick: (p: AeoPageSignals) => boolean
): { count: number; urls: string[] } {
  const withSignal = pages.filter((p) => !!p.aeoSignals && pick(p.aeoSignals));
  return {
    count: withSignal.length,
    urls: withSignal.map((p) => p.url).slice(0, CITATION_CHECK_LIMIT),
  };
}

export function buildCitationReadiness(audit: RunAuditResult): CitationReadinessResult {
  const okPages = audit.crawl.pages.filter((p): p is PageWithAeo => p.ok);
  const pagesWithSignals = okPages.filter((p) => !!p.aeoSignals);
  const totalPages = okPages.length;
  const pctOf = (n: number) => (totalPages > 0 ? Math.round((n / totalPages) * 100) : 0);

  // Each signal is evaluated independently. An audit cached before a given
  // signal was added to the crawler simply lacks that field on its aeoSignals
  // objects, so that one check reports "not evaluated in this crawl" while
  // the signals that WERE collected still produce a real, partial score —
  // never an all-or-nothing wall that asks the client to re-run everything.
  const hasField = (field: string) => pagesWithSignals.some((p) => field in p.aeoSignals!);

  const makeCitationCheck = (
    key: string,
    label: string,
    passed: boolean,
    presentCount: number,
    available: boolean,
    finding: string,
    statusText: string,
    recommendation: string,
    applicability?: string
  ): CitationReadinessCheck => ({
    key,
    label,
    finding,
    passed: available ? passed : false,
    measured: available,
    statusText: available
      ? statusText
      : "Not evaluated in this audit — this signal requires a fresh crawl. It will be measured on the next audit.",
    recommendation,
    applicability,
  });

  const orgPresent =
    okPages.filter((p) => p.structuredData.present && p.structuredData.types.some((t) => t.toLowerCase() === "organization")).length > 0;

  const checks: CitationReadinessCheck[] = [];

  // Author signals — three INDEPENDENT metrics, all computed through the
  // shared checkAuthorPresence() helper (same helper as the Trust & Entity
  // "Author name" check). The old single "Author pages / author bylines"
  // check combined bylines with profile-page links, so a site whose nav
  // linked to /team/ on every page reported "author bylines on 100% of
  // pages" while the Trust section truthfully found 0 named authors — an
  // irreconcilable contradiction on the same page set. Byline, profile
  // link, and Person schema are different things; each is now its own
  // check with its own wording.
  const authorBylineCount = pagesWithSignals.filter((p) => checkAuthorPresence(p).byline !== null).length;
  checks.push(
    makeCitationCheck(
      "author_byline",
      "Author byline (machine-readable)",
      authorBylineCount > 0,
      authorBylineCount,
      hasField("authorName"),
      "Author name exposed via meta name=author, rel=author, or itemprop=author.",
      authorBylineCount > 0
        ? `Found on ${authorBylineCount} of ${totalPages} pages (${pctOf(authorBylineCount)}%).`
        : "No machine-readable author byline found on any crawled page. Visible-text bylines (\"By …\") are not reliably machine-detectable in this crawl — verify manually if you believe authors are shown.",
      "Add a visible author byline (backed by meta author / Person schema) to content pages."
    )
  );

  const authorProfileCount = pagesWithSignals.filter((p) => checkAuthorPresence(p).profileLink).length;
  checks.push(
    makeCitationCheck(
      "author_profile",
      "Author profile page link",
      authorProfileCount > 0,
      authorProfileCount,
      hasField("hasAuthorProfilePage"),
      "A link to an author/profile page (e.g. /author/, /team/, /staff/, /contributors/).",
      authorProfileCount > 0
        ? `Linked from ${authorProfileCount} of ${totalPages} pages (${pctOf(authorProfileCount)}%).`
        : "No link to an author or profile page found on any crawled page.",
      "Link author bylines to a dedicated author/profile page so AI systems can attribute content to a real person."
    )
  );

  const authorSchemaCount = okPages.filter((p) => checkAuthorPresence(p).schema).length;
  checks.push(
    makeCitationCheck(
      "author_schema",
      "Author structured data (Person schema)",
      authorSchemaCount > 0,
      authorSchemaCount,
      hasField("authorName") || hasField("hasAuthorProfilePage"),
      "Person / author structured data (JSON-LD) on the page.",
      authorSchemaCount > 0
        ? `Found on ${authorSchemaCount} of ${totalPages} pages (${pctOf(authorSchemaCount)}%).`
        : "No Person (author) structured data found on any crawled page.",
      "Add Person schema for content authors (name plus a sameAs link to their professional profile)."
    )
  );

  const about = countWithSignal(pagesWithSignals, (s) => s.linksToAboutPage);
  checks.push(
    makeCitationCheck(
      "about_page",
      "About page",
      about.count > 0,
      about.count,
      hasField("linksToAboutPage"),
      "A link to an About page from crawled pages.",
      about.count > 0
        ? `Linked from ${about.count} of ${totalPages} pages (${pctOf(about.count)}%).`
        : "No link to an About page found on any crawled page.",
      "Add an About page that describes the organization or authors, and link to it from the site navigation."
    )
  );

  const editorial = countWithSignal(pagesWithSignals, (s) => s.linksToEditorialPolicyPage);
  checks.push(
    makeCitationCheck(
      "editorial_policy",
      "Editorial policy",
      editorial.count > 0,
      editorial.count,
      hasField("linksToEditorialPolicyPage"),
      "Links to an editorial / ethics / publishing-standards policy.",
      editorial.count > 0
        ? `Linked from ${editorial.count} of ${totalPages} pages (${pctOf(editorial.count)}%).`
        : "No editorial policy, ethics, or publishing-standards page found.",
      "Publish a short editorial policy (who writes, how content is reviewed and updated) and link it in the footer.",
      "Valid for: Sites publishing authored/editorial content (articles, blogs, guides, news) where E-E-A-T authorship signals matter. For a pure product or service store with no authored content, an editorial-policy page is not a meaningful signal — you can ignore this recommendation."
    )
  );

  const contact = countWithSignal(pagesWithSignals, (s) => s.hasContactInfo);
  checks.push(
    makeCitationCheck(
      "contact_info",
      "Contact information",
      contact.count > 0,
      contact.count,
      hasField("hasContactInfo"),
      "Phone, email, or a link to a contact page.",
      contact.count > 0
        ? `Found on ${contact.count} of ${totalPages} pages (${pctOf(contact.count)}%).`
        : "No phone number, email address, or contact-page link found on any crawled page.",
      "Add visible contact details (phone, email, address) or a contact page linked from the footer."
    )
  );

  const references = countWithSignal(pagesWithSignals, (s) => s.linksToSourcesPage || s.hasReferencesSection || s.externalAuthorityLinkCount > 0);
  checks.push(
    makeCitationCheck(
      "references",
      "References / sources",
      references.count > 0,
      references.count,
      hasField("externalAuthorityLinkCount") || hasField("linksToSourcesPage") || hasField("hasReferencesSection"),
      "External source links, a References/Sources section, or a sources page.",
      references.count > 0
        ? `Found on ${references.count} of ${totalPages} pages (${pctOf(references.count)}%).`
        : "No references, sources section, or external source links found on any crawled page.",
      "For informational content, link claims to the original authoritative source and add a References or Sources section where relevant."
    )
  );

  checks.push(
    makeCitationCheck(
      "organization_schema",
      "Organization schema",
      orgPresent,
      orgPresent ? 1 : 0,
      true, // structuredData is always collected, so this is always measurable
      "Organization JSON-LD identifying the entity behind the site.",
      orgPresent
        ? "Organization schema found on at least one crawled page."
        : "Organization schema not found on any crawled page.",
      "Add Organization JSON-LD with name, url, logo, and sameAs links to official profiles."
    )
  );

  const reviews = countWithSignal(pagesWithSignals, (s) => s.reviewSchemaPresent);
  checks.push(
    makeCitationCheck(
      "review_signals",
      "Review signals",
      reviews.count > 0,
      reviews.count,
      hasField("reviewSchemaPresent"),
      "Review or aggregateRating markup (e.g. on products, services, or local business).",
      reviews.count > 0
        ? `Review/rating markup found on ${reviews.count} of ${totalPages} pages (${pctOf(reviews.count)}%).`
        : "No Review or aggregateRating markup found — add it where genuine customer reviews exist.",
      "Add Review or aggregateRating schema only where real customer reviews exist — fabricated ratings damage trust."
    )
  );

  const lastModified = countWithSignal(pagesWithSignals, (s) => !!s.lastUpdatedDate);
  checks.push(
    makeCitationCheck(
      "last_modified",
      "Last-modified dates",
      lastModified.count > 0,
      lastModified.count,
      hasField("lastUpdatedDate"),
      "Machine-readable update dates (article:modified_time, time[datetime], dateModified).",
      lastModified.count > 0
        ? `Found on ${lastModified.count} of ${totalPages} pages (${pctOf(lastModified.count)}%).`
        : "No last-updated date found on any crawled page.",
      "Show a clear last-updated date and expose it via article:modified_time or dateModified."
    )
  );

  const privacy = countWithSignal(pagesWithSignals, (s) => s.linksToPrivacyPage);
  checks.push(
    makeCitationCheck(
      "privacy_policy",
      "Privacy policy",
      privacy.count > 0,
      privacy.count,
      hasField("linksToPrivacyPage"),
      "A link to a privacy policy.",
      privacy.count > 0
        ? `Linked from ${privacy.count} of ${totalPages} pages (${pctOf(privacy.count)}%).`
        : "No privacy policy link found on any crawled page.",
      "Publish a privacy policy and link it from the sitewide footer."
    )
  );

  const terms = countWithSignal(pagesWithSignals, (s) => s.linksToTermsPage);
  checks.push(
    makeCitationCheck(
      "terms",
      "Terms & conditions",
      terms.count > 0,
      terms.count,
      hasField("linksToTermsPage"),
      "A link to terms of use / terms & conditions.",
      terms.count > 0
        ? `Linked from ${terms.count} of ${totalPages} pages (${pctOf(terms.count)}%).`
        : "No terms & conditions link found on any crawled page.",
      "Publish terms of use and link them from the sitewide footer."
    )
  );

  const measuredChecks = checks.filter((c) => c.measured);
  const passCount = measuredChecks.filter((c) => c.passed).length;
  return {
    score: measuredChecks.length > 0 ? Math.round((passCount / measuredChecks.length) * 100) : null,
    passCount,
    measuredCount: measuredChecks.length,
    checks,
  };
}

// ---------------------------------------------------------------------------
// AI Visibility Opportunities — instead of only reporting problems, identify
// concrete content formats that make a site more likely to be surfaced and
// cited by AI answer engines. Every opportunity is derived from crawl data
// (headings, structure, schema), never from guesswork.
// ---------------------------------------------------------------------------

function opportunity(
  key: string,
  title: string,
  benefit: string,
  action: string,
  pages: string[],
  evidence: string,
  applicability?: string
): AiVisibilityOpportunity {
  // Keep the FULL page list on the opportunity so the exported CSV can
  // contain every eligible URL ("the report and CSV must always match").
  // The display layer decides how many to show, so nothing here caps what
  // the CSV can hold — same convention as AeoCheck.affectedUrls.
  return {
    key,
    title,
    benefit,
    action,
    pages,
    pageCount: pages.length,
    evidence,
    applicability,
  };
}

export function buildAiVisibilityOpportunities(audit: RunAuditResult): AiVisibilityOpportunity[] {
  const okPages = audit.crawl.pages.filter((p): p is PageWithAeo => p.ok);
  const pagesWithSignals = okPages.filter((p) => !!p.aeoSignals);
  if (pagesWithSignals.length === 0) return [];

  const out: AiVisibilityOpportunity[] = [];

  // 1. FAQ opportunities — pages already answering several questions, no FAQPage schema.
  const faqCandidates = pagesWithSignals.filter((p) => p.aeoSignals!.questionHeadingCount >= 2 && !p.aeoSignals!.faqSchemaPresent);
  if (faqCandidates.length > 0) {
    out.push(
      opportunity(
        "faq_opportunity",
        "FAQ sections for existing questions",
        "FAQPage schema maps almost one-to-one onto how AI answer engines compose responses — questions with direct answers are the most-cited content format in AI results.",
        "Turn pages that already answer multiple questions into a formatted FAQ section with FAQPage schema — no new content required.",
        faqCandidates.map((p) => p.url),
        `${faqCandidates.length} page${faqCandidates.length === 1 ? "" : "s"} already answer 2+ questions in prose but lack FAQPage markup.`,
        "Applicability: Relevant when pages genuinely answer questions in prose (FAQs, Q&A sections, documentation). If your site has no question-and-answer content, you can ignore this recommendation."
      )
    );
  }

  // 2. Step-by-step opportunities — how-to content in prose, not yet a list.
  const stepCandidates = pagesWithSignals.filter((p) => p.aeoSignals!.questionHeadingCount > 0 && !p.aeoSignals!.hasOrderedList);
  if (stepCandidates.length > 0) {
    out.push(
      opportunity(
        "step_by_step",
        "Step-by-step formatting",
        "AI engines quote numbered steps directly when answering 'how to' queries — ordered lists are dramatically easier to extract than steps buried in paragraphs.",
        "Where a page explains a process in prose, re-format the sequence as a numbered <ol> so each step is individually extractable.",
        stepCandidates.map((p) => p.url),
        `${stepCandidates.length} page${stepCandidates.length === 1 ? "" : "s"} contain question-style headings without a single ordered list — likely how-to content.`,
        "Applicability: Relevant to sites that publish how-to, tutorial, or step-by-step process content. If your site has no process-style content (e.g. a pure product or service-page site), you can ignore this recommendation."
      )
    );
  }

  // 3. Comparison content — pages whose title signals a comparison, without a table.
  const comparisonCandidates = pagesWithSignals.filter(
    (p) =>
      /\b(vs\.?|versus|compare|comparison|alternatives?)\b/i.test(p.title.content ?? "") &&
      !p.aeoSignals!.hasTable
  );
  if (comparisonCandidates.length > 0) {
    out.push(
      opportunity(
        "comparison",
        "Comparison tables",
        "'X vs Y' queries are extremely common in AI chat — a comparison table gives AI systems (and readers) the side-by-side facts they need to answer and cite.",
        "For pages that compare options or alternatives, add a feature-by-feature comparison table — the single most citable format for comparison queries.",
        comparisonCandidates.map((p) => p.url),
        `${comparisonCandidates.length} page${comparisonCandidates.length === 1 ? "" : "s"} have comparison-style titles without any table on the page.`
      )
    );
  }

  // 4. Definitional content — "what is" pages that could be strengthened.
  const definitionCandidates = pagesWithSignals.filter((p) =>
    /\bwhat (is|are|does|isn|aren)\b|\bdefinition\b|\bmeaning\b/i.test(p.title.content ?? "")
  );
  if (definitionCandidates.length > 0) {
    out.push(
      opportunity(
        "definitions",
        "Definition answers (What is…)",
        "AI engines answer 'What is X?' queries by quoting the clearest definition — a one- or two-sentence answer immediately after the H1 is the most likely text to be cited.",
        "On definitional pages, put a crisp 1-2 sentence answer directly under the H1, then support it with facts further down.",
        definitionCandidates.map((p) => p.url),
        `${definitionCandidates.length} page${definitionCandidates.length === 1 ? "" : "s"} are definition-style pages — prime candidates for a direct-answer opening.`
      )
    );
  }

  // 5. List/table structure for substantive pages with none.
  const structureCandidates = pagesWithSignals.filter(
    (p) =>
      p.wordCount >= 400 &&
      (p.headings.h2 + p.headings.h3) >= 3 &&
      !p.aeoSignals!.hasTable &&
      !p.aeoSignals!.hasUnorderedList &&
      !p.aeoSignals!.hasOrderedList
  );
  if (structureCandidates.length > 0) {
    out.push(
      opportunity(
        "lists_tables",
        "Lists & tables for dense content",
        "Lists and tables are parsed into structured answers (steps, rankings, comparisons) far more reliably than the same facts in prose paragraphs.",
        "For long pages with several sections and no list or table, convert any natural sequence or comparison into a list or table.",
        structureCandidates.map((p) => p.url),
        `${structureCandidates.length} long page${structureCandidates.length === 1 ? "" : "s"} (400+ words, 3+ sections) contain no lists or tables at all.`
      )
    );
  }

  // 6. Statistics — long pages with almost no citable numbers.
  const statCandidates = pagesWithSignals.filter((p) => p.wordCount >= 800 && p.aeoSignals!.numericDataDensityPct < 0.5);
  if (statCandidates.length > 0) {
    out.push(
      opportunity(
        "statistics",
        "Citable statistics",
        "Concrete numbers (percentages, dates, prices) are exactly what AI answer engines extract and quote — vague claims are far less likely to be cited.",
        "On long-form pages, back key claims with specific, sourced statistics rather than qualitative language.",
        statCandidates.map((p) => p.url),
        `${statCandidates.length} long-form page${statCandidates.length === 1 ? "" : "s"} (800+ words) contain almost no numeric data (under 0.5% of words).`
      )
    );
  }

  // 7. Product specification opportunities.
  const productCandidates = pagesWithSignals.filter(
    (p) =>
      /\b(buy|price|pricing|product|shop|specs?|models?|compare)\b/i.test(p.title.content ?? "") &&
      !p.structuredData.types.some((t) => t.toLowerCase() === "product")
  );
  if (productCandidates.length > 0) {
    out.push(
      opportunity(
        "product_specs",
        "Product specifications & schema",
        "AI shopping assistants reference Product schema (price, availability, ratings) directly when recommending or comparing products.",
        "For product-style pages, add Product JSON-LD and present key specs in a table so facts are machine-readable.",
        productCandidates.map((p) => p.url),
        `${productCandidates.length} product-style page${productCandidates.length === 1 ? "" : "s"} have no Product schema — price/availability data is not machine-readable.`,
        "Applicability: Relevant to ecommerce and product-led pages. If your website does not sell or present purchasable products, you can ignore this recommendation."
      )
    );
  }

  // 8. Local intent — site with clear contact info but no LocalBusiness markup.
  const localCandidates = pagesWithSignals.filter((p) => p.aeoSignals!.hasContactInfo && !p.structuredData.types.some((t) => t.toLowerCase() === "localbusiness"));
  if (localCandidates.length > 0) {
    out.push(
      opportunity(
        "local_intent",
        "Local intent content",
        "For businesses with a physical presence, AI systems answer location-aware queries (hours, address, service areas) best when that data is structured and consistent.",
        "If this business serves a physical area, add LocalBusiness schema and a location page with address, hours, and service area — only relevant if there is a physical presence.",
        localCandidates.map((p) => p.url),
        `${localCandidates.length} page${localCandidates.length === 1 ? "" : "s"} expose contact information but the site has no LocalBusiness markup.`,
        "Applicability: Relevant only to businesses with a physical location or defined service area. If your organization operates purely online or serves customers without a local service area, you can ignore this recommendation."
      )
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// AI/GenAI Quick Wins — a curated subset of failing AEO checks that
// combine high AI/search impact with low or moderate implementation effort.
// These surface the "if you only have a little time, these are the AI
// improvements you should implement first" recommendations.
// ---------------------------------------------------------------------------

export interface AiQuickWin {
  key: string;
  label: string;
  impact: AeoImpact;
  effort: AeoDifficulty;
  timeLabel: string;
  affectedCount: number;
  countUnit: string;
  /** AI-specific "why it matters" — prefers whyItMattersAi when available,
   * falls back to whyItMatters. */
  whyItMatters: string;
  /** Concrete action the site owner should take. */
  action: string;
  /** Plain-English AI explanation of why this matters. */
  aiExplanation: string;
}

/** Map AeoImpact to a numeric weight for sorting (higher = more impactful). */
const AI_QW_IMPACT_WEIGHT: Record<AeoImpact, number> = {
  very_high: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Map AeoDifficulty to a numeric weight for sorting (lower = easier). */
const AI_QW_DIFF_WEIGHT: Record<AeoDifficulty, number> = {
  easy: 1,
  medium: 2,
  advanced: 3,
  enterprise: 4,
};

/** Plain-English AI explanations keyed by check key — used when the
 * AEO copy doesn't have a whyItMattersAi field. Only includes the
 * most common high-impact checks; others fall back to the generic
 * AEO whyItMatters text. */
const AI_EXPLANATIONS: Record<string, string> = {
  organization_schema:
    "Organization schema helps AI systems confirm who operates the website, improving entity recognition in knowledge graphs and AI-generated answers.",
  faq_schema:
    "FAQPage schema maps directly to how AI answer engines generate responses — structured Q&A pairs are the most reusable format for AI systems.",
  author_name:
    "Clear author attribution helps AI systems assess content credibility and source quality, which influences how much weight they give your content.",
  author_schema:
    "Author markup gives AI systems machine-readable attribution signals, making it easier to verify content provenance and expertise.",
  article_schema:
    "Article schema provides structured headline, author, and date signals that AI systems use to assess content freshness and editorial quality.",
  sameas:
    "Verified sameAs links help AI systems confirm your entity identity across platforms, reducing ambiguity in knowledge graphs.",
  breadcrumbs_schema:
    "Breadcrumb schema helps AI systems understand your content hierarchy, improving topical context for AI-generated answers.",
  llms_txt:
    "An llms.txt file gives AI systems a structured overview of your site, making it easier for them to understand and cite your content.",
  gptbot:
    "Allowing GPTBot ensures OpenAI's systems can access your content for ChatGPT answers and citations.",
  claudebot:
    "Allowing ClaudeBot ensures Anthropic's systems can access your content for Claude answers and citations.",
  perplexitybot:
    "Allowing PerplexityBot ensures Perplexity's systems can access your content for AI-powered search answers.",
  thin_content_aeo:
    "AI systems prefer comprehensive, self-contained answers — thin content is less likely to be selected as a source for AI-generated responses.",
  direct_answer_content:
    "Content that directly answers questions is easier for AI systems to identify, extract, and cite when generating responses.",
  localbusiness_schema:
    "LocalBusiness schema gives AI systems structured location and contact data for answering local queries accurately.",
  person_schema:
    "Person/author schema helps AI systems attribute content to a real, identifiable expert — a factor in source credibility assessment.",
  product_schema:
    "Product schema gives AI shopping assistants structured price, availability, and review data to reference directly.",
};

/**
 * Build the AI/GenAI Quick Wins list from ranked AEO failing checks.
 *
 * Selection criteria:
 *  1. High or very-high expected AI/search impact
 *  2. Easy or moderate implementation effort
 *  3. At least one affected page
 *  4. Has an actionable recommendation
 *
 * The result is sorted by impact (highest first), then effort (easiest
 * first), then affected count (most pages first). At most `limit` items
 * are returned (default 5).
 */
export function buildAiQuickWins(
  aeoFailingChecks: AeoCheck[],
  limit = 5
): AiQuickWin[] {
  return aeoFailingChecks
    .filter((c) => {
      // High or very-high impact only
      if (c.expectedImpact !== "very_high" && c.expectedImpact !== "high") return false;
      // Easy or medium effort only
      if (c.difficulty !== "easy" && c.difficulty !== "medium") return false;
      // Must have affected pages
      if (c.affectedCount <= 0) return false;
      // Must have an actionable recommendation
      if (!c.recommendedFix && !c.whatToImplement) return false;
      return true;
    })
    .sort((a, b) => {
      // Impact: highest first
      const impactDiff = AI_QW_IMPACT_WEIGHT[b.expectedImpact] - AI_QW_IMPACT_WEIGHT[a.expectedImpact];
      if (impactDiff !== 0) return impactDiff;
      // Effort: easiest first
      const diffDiff = AI_QW_DIFF_WEIGHT[a.difficulty] - AI_QW_DIFF_WEIGHT[b.difficulty];
      if (diffDiff !== 0) return diffDiff;
      // Affected count: most pages first
      return b.affectedCount - a.affectedCount;
    })
    .slice(0, limit)
    .map((c) => ({
      key: c.key,
      label: c.label,
      impact: c.expectedImpact,
      effort: c.difficulty,
      timeLabel: c.timeLabel,
      affectedCount: c.affectedCount,
      countUnit: c.countUnit ?? "pages",
      whyItMatters: c.whyItMattersAi || c.whyItMatters,
      action: c.whatToImplement || c.recommendedFix || "",
      aiExplanation: AI_EXPLANATIONS[c.key] || c.whyItMatters,
    }));
}

