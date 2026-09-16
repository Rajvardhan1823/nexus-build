import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const geminiModels = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];

const ListingSchema = z.object({
  title: z.string().nullable().transform((value) => value?.trim() || "Untitled opportunity"),
  company: z.string().nullable().transform((value) => value?.trim() || "Not specified"),
  location: z.string().nullable(),
  remote_ok: z.boolean(),
  stipend: z.string().nullable(),
  required_skills: z.array(z.string()),
  experience_level: z.string().nullable(),
  deadline: z.string().nullable(),
  description: z.string().nullable().transform((value) => value?.trim() || "No description was available on the source page."),
  source: z.string().nullable().transform((value) => value?.trim() || "website"),
});
const ListingsSchema = z.object({ listings: z.array(ListingSchema).min(1).max(25) });

const ignoredWords = new Set(["about", "after", "and", "are", "but", "company", "description", "for", "from", "have", "into", "job", "jobs", "looking", "our", "position", "required", "role", "that", "the", "their", "this", "with", "work", "you", "your"]);

function keywords(value: string) {
  return value.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g)?.filter((word) => !ignoredWords.has(word)) ?? [];
}

function localFitScore(resumeText: string, listing: z.infer<typeof ListingSchema>) {
  const resumeWords = new Set(keywords(resumeText));
  const skills = listing.required_skills.filter(Boolean);
  const targets = skills.length ? skills : Array.from(new Set(keywords(`${listing.title} ${listing.description}`))).slice(0, 12);
  const matches = targets.filter((skill) => keywords(skill).some((word) => resumeWords.has(word)));
  const ratio = matches.length / Math.max(targets.length, 4);
  const score = Math.round(Math.max(20, Math.min(95, 25 + ratio * 70)));
  const preview = matches.slice(0, 4).join(", ");
  return {
    score,
    explanation: preview
      ? `Skill-overlap estimate: matches ${preview}.`
      : "Skill-overlap estimate based on the selected resume; review the role requirements before applying.",
  };
}

async function scoreListings(listings: z.infer<typeof ListingSchema>[], resumeText: string) {
  const localScores = listings.map((listing) => localFitScore(resumeText, listing));
  try {
    const fit = await callGemini(
      "You score job fits for a candidate. Return only JSON. Give one score from 0 to 100 and a concise evidence-based explanation for each listing, in exactly the same order. Never invent experience.",
      JSON.stringify({ listings, resume: resumeText.slice(0, 18000), shape: { scores: [{ score: 0, explanation: "string" }] } }),
    );
    const parsed = parseModelJson(fit) as { scores?: unknown; matches?: unknown } | unknown[];
    const candidateScores = Array.isArray(parsed) ? parsed : Array.isArray(parsed.scores) ? parsed.scores : Array.isArray(parsed.matches) ? parsed.matches : [];
    return listings.map((listing, index) => {
      const candidate = candidateScores[index] as { score?: unknown; fit_score?: unknown; explanation?: unknown; reason?: unknown } | undefined;
      const rawScore = Number(candidate?.score ?? candidate?.fit_score);
      if (!Number.isFinite(rawScore)) return localFitScore(resumeText, listing);
      return {
        score: Math.max(0, Math.min(100, Math.round(rawScore))),
        explanation: typeof candidate?.explanation === "string" ? candidate.explanation : typeof candidate?.reason === "string" ? candidate.reason : localFitScore(resumeText, listing).explanation,
      };
    });
  } catch (error) {
    console.warn("AI scoring unavailable; using selected-resume skill-overlap scores.", error);
    return localScores;
  }
}

function parseModelJson(content: string): unknown {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = start; index < cleaned.length; index += 1) {
        const char = cleaned[index];
        if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
        if (char === '"') quoted = true;
        else if (char === "{") depth += 1;
        else if (char === "}" && --depth === 0) return JSON.parse(cleaned.slice(start, index + 1));
      }
    }
    if (cleaned.startsWith('"')) return JSON.parse(`{${cleaned}}`);
    throw new Error("Gemini returned malformed JSON.");
  }
}

async function callGemini(systemInstruction: string, prompt: string, maxOutputTokens = 1600) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  let lastError = "Gemini did not return a response.";

  for (const model of geminiModels) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens, responseMimeType: "application/json" },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        const content = body?.candidates?.[0]?.content?.parts?.map((part: { text?: unknown }) => part.text).filter((text: unknown): text is string => typeof text === "string").join("");
        if (typeof content === "string" && content) return content;
        lastError = "Gemini returned an empty response.";
        break;
      }

      lastError = typeof body?.error?.message === "string" ? body.error.message : `Gemini request failed (${response.status}).`;
      const retryable = response.status === 429 || response.status === 500 || response.status === 503;
      if (!retryable || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }

  throw new Error(`${lastError} Please try again in a moment.`);
}

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 100000);
}

function isPublicHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Enter a valid http or https website URL.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) throw new Error("Only publicly accessible website URLs can be extracted.");
  return url;
}

async function fetchPublicPage(url: URL) {
  try {
    const response = await fetch(url, { headers: { "Accept": "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; Nexus/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`The website could not be reached (${response.status}).`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("That URL did not return an HTML webpage.");
    return response.text();
  } catch (directFetchError) {
    const serpApiKey = process.env["SERPAPI_API_KEY"];
    if (!serpApiKey) throw directFetchError;
    const endpoint = new URL("https://serpapi.com/search.json");
    endpoint.searchParams.set("engine", "google");
    endpoint.searchParams.set("q", `site:${url.hostname} ${url.pathname}`);
    endpoint.searchParams.set("api_key", serpApiKey);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw directFetchError;
    const result = await response.json() as { organic_results?: Array<{ title?: string; snippet?: string; link?: string }> };
    const snippets = (result.organic_results ?? []).slice(0, 5).map((item) => [item.title, item.snippet, item.link].filter(Boolean).join("\n")).join("\n\n");
    if (!snippets) throw directFetchError;
    return snippets;
  }
}

export const Route = createFileRoute("/api/groq")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { action?: string; url?: string; resumeText?: string; question?: string; context?: unknown };
          if (body.action === "ingest_listing") {
            const url = isPublicHttpUrl(z.string().url().parse(body.url));
            const raw = stripHtml(await fetchPublicPage(url));
            if (raw.length < 120) return Response.json({ error: "The website did not contain enough readable public text. Pages requiring sign-in, bot protection, or browser-only rendering cannot be extracted." }, { status: 422 });
            const content = await callGemini(
              "You extract career-opportunity details from any public HTML website. Return only valid JSON. Do not invent facts. Use null when a field is absent. For source, use the host name.",
              `Extract every distinct job or internship opportunity available in this page's text. Return one item per role, up to 25 roles. Keep each description to one concise sentence. Return a single valid JSON object only, with lower-case field names and no Markdown: {"listings":[{"title":"string|null","company":"string|null","location":"string|null","remote_ok":true,"stipend":"string|null","required_skills":["string"],"experience_level":"string|null","deadline":"YYYY-MM-DD|null","description":"string|null","source":"string|null"}]}. Do not merge separate positions. If there are no jobs or internships, return {"listings":[]}.\n\nPAGE URL: ${url}\nPAGE TEXT:\n${raw}`,
              6000,
            );
            const parsedListings = parseModelJson(content) as { listings?: unknown };
            if (!Array.isArray(parsedListings.listings) || parsedListings.listings.length === 0) return Response.json({ error: "No job or internship opportunities were found on that page." }, { status: 422 });
            const listings = ListingsSchema.parse(parsedListings).listings;
            let scores: Array<{ score: number; explanation: string | null }> = listings.map(() => ({ score: 0, explanation: null }));
            if (body.resumeText?.trim()) {
              scores = await scoreListings(listings, body.resumeText.trim());
            }
            return Response.json({ listings: listings.map((listing) => ({ ...listing, raw_text: raw, extraction_status: "ready" })), scores });
          }
          if (body.action === "score_listings") {
            const resumeText = z.string().min(1).max(30000).parse(body.resumeText);
            const listings = z.array(ListingSchema).min(1).max(50).parse(body.context);
            return Response.json({ scores: await scoreListings(listings, resumeText) });
          }
          if (body.action === "chat") {
            const question = z.string().min(2).max(1000).parse(body.question);
            const context = JSON.stringify(body.context ?? {}).slice(0, 50000);
            const content = await callGemini(
              "You are a concise, helpful career assistant. The workspace records may contain resumes with extractedText: treat that as the candidate's actual resume and use its concrete skills and experience when relevant. Answer the specific question, not a generic career tip. Use job titles, companies, skills, and fit scores from the records where helpful. Do not repeat a prior answer unless the question is materially the same. If no resume or relevant record exists, state exactly what is missing. Do not claim to have taken actions.",
              `WORKSPACE RECORDS (including the extracted resume text and recent conversation):\n${context}\n\nCURRENT QUESTION: ${question}\n\nReturn exactly one valid JSON object: {"answer":"a direct, specific answer"}`,
            );
            const parsed = parseModelJson(content) as { answer?: unknown };
            return Response.json({ answer: typeof parsed.answer === "string" ? parsed.answer : "I could not find enough information in the workspace yet." });
          }
          return Response.json({ error: "Unknown action." }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The request could not be completed.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
