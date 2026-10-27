/* Read-only probe: dump the stored timing data for recent audits so we can
 * see exactly what the report is rendering from. SELECT only — never writes.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
const env = fs.readFileSync(envPath, "utf8");
function envVal(name) {
  const m = env.match(new RegExp(`^${name}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}
const SUPABASE_URL = envVal("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = envVal("SUPABASE_SERVICE_ROLE_KEY");

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

(async () => {
  const { data, error } = await supabase
    .from("audits")
    .select("id, target_url, created_at, audit_result")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) {
    console.error("SELECT audits failed:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log("No audits rows found.");
    process.exit(0);
  }
  for (const row of data) {
    const r = row.audit_result || {};
    const t = r.timings || {};
    console.log("--------------------------------------------------");
    console.log(`audit ${row.id}  domain=${row.domain}  created_at=${row.created_at}`);
    console.log(`  auditStartedAt=${r.auditStartedAt ?? "MISSING"}  crawlDurationMs=${r.crawlDurationMs}`);
    console.log(
      `  timings: totalMs=${t.totalMs} crawlMs=${t.crawlMs} cwvWallMs=${t.cwvWallMs ?? "MISSING"} ` +
        `homepagePSI=${t.homepagePageSpeedMs} streamedCwv=${t.streamedCwvMs} remainingCwv=${t.remainingCwvMs} ` +
        `brokenLinks=${t.brokenLinksMs} images=${t.streamedImagesMs}`
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
