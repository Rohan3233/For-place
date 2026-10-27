import type { LLMProvider } from "./types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * NOTE ON MODEL CHOICE: defaults to "gemini-2.5-flash-lite" — Google's own
 * docs recommend this as the stable successor now that the 2.0 Flash/
 * Flash-Lite line has been retired. Deliberately NOT defaulting to a
 * "-preview" tagged model (e.g. gemini-3-flash-preview) for production
 * code — preview models can change or disappear with little warning,
 * which is a bad fit for a paid product's core feature. Google's model
 * lineup moves fast; if you're reading this months later, check
 * https://ai.google.dev/gemini-api/docs/models for the current
 * recommended budget-tier model and update the default here.
 *
 * NOTE ON COST: this is deliberately called as rarely as possible — see
 * explainPage.ts, which batches ALL of a page's AI-eligible issues (title,
 * meta description, H1) into a single request instead of one call per
 * issue. Most flags (missing alt text, canonical issues, multiple H1s)
 * never reach this class at all — they're pure template, per templates.ts.
 */
export class GeminiProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "gemini-3.1-flash-lite",
    private readonly timeoutMs: number = 20_000
  ) {}

  async generateJSON(systemInstruction: string, userPrompt: string): Promise<string> {
    const url = `${GEMINI_ENDPOINT}/${this.model}:generateContent`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            // Ask Gemini to return valid JSON directly, rather than hoping
            // it doesn't wrap the answer in markdown code fences.
            responseMimeType: "application/json",
            temperature: 0.4,
          },
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `Gemini request timed out after ${this.timeoutMs}ms.`
          : err instanceof Error
            ? err.message
            : "Unknown error calling Gemini API.";
      throw new Error(message);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini API returned ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Gemini response did not contain the expected text content.");
    }
    return text;
  }
}
