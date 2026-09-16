import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const groqModel = "llama-3.3-70b-versatile";

const ListingSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  remote_ok: z.boolean(),
  stipend: z.string().nullable(),
  required_skills: z.array(z.string()),
  experience_level: z.string().nullable(),
  deadline: z.string().nullable(),
  description: z.string(),
  source: z.string(),
});

async function callGroq(messages: Array<{ role: string; content: string }>) {
  const key = process.env["GROQ_API_KEY"];
  if (!key) throw new Error("GROQ_API_KEY is not configured.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: groqModel, messages, temperature: 0.1, max_tokens: 1200, response_format: { type: "json_object" } }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `Groq request failed (${response.status}).`;
    throw new Error(message);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq returned an empty response.");
  return content;
}

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 30000);
}

export const Route = createFileRoute("/api/groq")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { action?: string; url?: string; resumeText?: string; question?: string; context?: unknown };
          if (body.action === "ingest_listing") {
            const url = z.string().url().parse(body.url);
            const page = await fetch(url, { headers: { "User-Agent": "Nexus Career Intelligence/1.0" } });
            if (!page.ok) return Response.json({ error: `The listing page could not be reached (${page.status}).` }, { status: 422 });
            const raw = stripHtml(await page.text());
            if (raw.length < 120) return Response.json({ error: "The listing page did not contain enough readable text." }, { status: 422 });
            const content = await callGroq([
              { role: "system", content: "You normalize public job and internship pages. Return only valid JSON. Do not invent facts. Use null when a field is absent. For source, use the host name." },
              { role: "user", content: `Extract this listing into the exact JSON shape: {"title":"string","company":"string","location":"string|null","remote_ok":true,"stipend":"string|null","required_skills":["string"],"experience_level":"string|null","deadline":"YYYY-MM-DD|null","description":"string","source":"string"}.\n\nPAGE URL: ${url}\nPAGE TEXT:\n${raw}` },
            ]);
            const listing = ListingSchema.parse(JSON.parse(content));
            let score = 0;
            let explanation: string | null = null;
            if (body.resumeText?.trim()) {
              const fit = await callGroq([
                { role: "system", content: "You score a job fit for a candidate. Return only JSON with score from 0 to 100 and a concise explanation grounded in the supplied resume and listing. Never invent experience." },
                { role: "user", content: JSON.stringify({ listing, resume: body.resumeText.slice(0, 18000), shape: { score: 0, explanation: "string" } }) },
              ]);
              const parsed = JSON.parse(fit) as { score?: number; explanation?: string };
              score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
              explanation = typeof parsed.explanation === "string" ? parsed.explanation : null;
            }
            return Response.json({ listing: { ...listing, raw_text: raw, extraction_status: "ready" }, score, explanation });
          }
          if (body.action === "chat") {
            const question = z.string().min(2).parse(body.question);
            const context = JSON.stringify(body.context ?? {}).slice(0, 26000);
            const content = await callGroq([
              { role: "system", content: "You are Nexus, a career intelligence assistant. Answer only from the user's supplied workspace records. If there is not enough evidence, say so. Be concise, practical, and mention the relevant company or title when possible. Never claim to have performed an action." },
              { role: "user", content: `Workspace records:\n${context}\n\nQuestion: ${question}\nReturn JSON: {"answer":"string"}` },
            ]);
            const parsed = JSON.parse(content) as { answer?: string };
            return Response.json({ answer: parsed.answer ?? "I could not find enough information in your workspace yet." });
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