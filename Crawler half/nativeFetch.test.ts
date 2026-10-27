/**
 * Tests for nativeFetch — the crawler's node:http/https fetch that bypasses
 * Next.js's fetch-cache instrumentation. Runs against a local node:http
 * server, so no external network is needed.
 */
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { nativeFetch } from "./nativeFetch";

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

async function withServer(
  handler: http.RequestListener,
  fn: (origin: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function run() {
  await withServer((req, res) => {
    if (req.url === "/echo") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "text/plain", "X-Custom": "yes" });
        res.end(`method=${req.method} body=${body}`);
      });
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(301, { Location: "/target" });
      res.end();
      return;
    }
    if (req.url === "/manual") {
      res.writeHead(302, { Location: "/target" });
      res.end();
      return;
    }
    if (req.url === "/target") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("target reached");
      return;
    }
    if (req.url === "/slow") {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 5000);
      return;
    }
    res.writeHead(404);
    res.end("nope");
  }, async (origin) => {
    // --- GET: status, body, headers ---
    const get = await nativeFetch(`${origin}/echo`, { method: "GET" });
    assertTrue("GET ok", get.ok === true && get.status === 200);
    assertTrue("GET body", (await get.text()) === "method=GET body=");
    assertTrue("GET header", get.headers.get("x-custom") === "yes");
    assertTrue("GET missing header is null", get.headers.get("missing") === null);
    assertTrue("GET url is final", get.url === `${origin}/echo`);

    // --- HEAD: no body, headers present ---
    const head = await nativeFetch(`${origin}/echo`, { method: "HEAD" });
    assertTrue("HEAD ok", head.ok === true);
    assertTrue("HEAD body empty", (await head.text()) === "");

    // --- POST with body ---
    const post = await nativeFetch(`${origin}/echo`, { method: "POST", body: JSON.stringify({ a: 1 }) });
    assertTrue("POST body echoed", (await post.text()) === 'method=POST body={"a":1}');

    // --- Redirect follow ---
    const followed = await nativeFetch(`${origin}/redirect`);
    assertTrue("follow redirect reaches target", (await followed.text()) === "target reached");
    assertTrue("follow redirect final url", followed.url === `${origin}/target`);

    // --- Redirect manual: 3xx returned as-is with location header ---
    const manual = await nativeFetch(`${origin}/manual`, { redirect: "manual" });
    assertTrue("manual redirect keeps 302", manual.status === 302);
    assertTrue("manual redirect location header", manual.headers.get("location") === "/target");
    assertTrue("manual redirect not ok", manual.ok === false);

    // --- Timeout: rejects with an AbortError ---
    let timedOut = false;
    try {
      await nativeFetch(`${origin}/slow`, { timeoutMs: 200 });
    } catch (err) {
      timedOut = err instanceof Error && err.name === "AbortError";
    }
    assertTrue("timeout rejects with AbortError", timedOut);

    // --- Connection refused: rejects with a code-carrying error ---
    let refused = false;
    try {
      await nativeFetch(`http://127.0.0.1:1/`, { timeoutMs: 2000 });
    } catch (err) {
      refused = err instanceof Error && typeof (err as { code?: string }).code === "string";
    }
    assertTrue("connection refused rejects with error code", refused);

    // --- 404 ---
    const notFound = await nativeFetch(`${origin}/missing`);
    assertTrue("404 surfaces as !ok with status", notFound.ok === false && notFound.status === 404);
    assertTrue("404 body readable", (await notFound.text()) === "nope");
  });

  console.log("\nDone. If all lines above say PASS, nativeFetch is intact.");
}

if (require.main === module) {
  run();
}
