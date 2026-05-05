/**
 * In-page assistant — streaming chat endpoint (Groq).
 *
 * Flow:
 *   client POST { messages } → validate → call Groq /chat/completions
 *   with stream=true → relay text deltas to the client as SSE.
 *
 * Model: llama-3.3-70b-versatile via Groq's OpenAI-compatible API.
 * Free tier (atual): ~14.4k req/dia, 6k tokens/min — sobra muito.
 *
 * No persistence: each request is independent. Conversation continuity
 * is the client's job (it sends back the last N turns from localStorage).
 *
 * Rate-limit: best-effort per-IP token bucket using an in-memory map.
 * Vercel Functions are stateless across cold starts, so this is a
 * speed bump for accidental loops, not abuse defense. If abuse becomes
 * real, move to Supabase (already wired up in this repo).
 */
import type { APIRoute } from "astro";
import { z } from "astro:content";
import { SYSTEM_PROMPT } from "~/lib/chatbot/knowledge";

export const prerender = false;

const MODEL = "llama-3.3-70b-versatile";
const MAX_OUTPUT_TOKENS = 600;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const payloadSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
});

// Per-IP rate limit: 30 requests / 10 min. In-memory, resets per isolate.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(503, "Chat indisponível no momento.");
  }

  const ip = getClientIp(request);
  if (!rateLimitOk(ip)) {
    return jsonError(429, "Muitas perguntas seguidas. Tenta de novo em alguns minutos.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "JSON inválido.");
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Mensagens inválidas.");
  }

  // Conversation must start with a user turn (system goes separately below).
  const messages = parsed.data.messages;
  const first = messages[0];
  if (!first || first.role !== "user") {
    return jsonError(400, "Conversa precisa começar com uma pergunta.");
  }

  const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.4,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.warn("groq error", upstream.status, detail.slice(0, 500));
    return jsonError(502, "Não consegui responder agora.");
  }

  // Relay: parse OpenAI-compatible SSE, emit only content deltas to client.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // OpenAI/Groq SSE frames are separated by \n\n; payload lines start with "data:".
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const lines = frame.split("\n");
            let dataLine: string | null = null;
            for (const line of lines) {
              if (line.startsWith("data:")) {
                dataLine = line.slice(5).trim();
                break;
              }
            }
            if (!dataLine) continue;
            if (dataLine === "[DONE]") {
              controller.enqueue(sseDone());
              break outer;
            }

            try {
              const evt = JSON.parse(dataLine) as {
                choices?: Array<{
                  delta?: { content?: string };
                  finish_reason?: string | null;
                }>;
              };
              const text = evt.choices?.[0]?.delta?.content;
              if (typeof text === "string" && text.length > 0) {
                controller.enqueue(sseEncode({ text }));
              }
            } catch {
              /* tolerate frames we don't understand */
            }
          }
        }
        controller.enqueue(sseDone());
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("chat relay error", err);
        controller.enqueue(sseEncode({ error: "stream interrupted" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
