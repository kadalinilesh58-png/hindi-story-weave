// Paralon Cloud AI helper. Free model only (zero credits on the key).
export const FREE_MODEL = "qwen3.8-27b";
const ENDPOINT = "https://paraloncloud.com/v1/chat/completions";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function paralonChat(
  messages: Msg[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const key = process.env["PARALON_API_KEY"];
  if (!key) throw new Error("PARALON_API_KEY missing");

  let lastError = "unknown error";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: FREE_MODEL,
          messages,
          temperature: opts.temperature ?? 0.9,
          max_tokens: opts.maxTokens ?? 1800,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });

      if (!res.ok) {
        lastError = `AI ${res.status}: ${(await res.text()).slice(0, 300)}`;
        if (res.status === 429 || res.status >= 500) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        throw new Error(lastError);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (text.trim().length > 0) return text;
      lastError = "AI returned empty text";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(lastError);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Story text must contain no symbols, emoji, numbers or stars (rule 8).
export function cleanHindi(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "");
  text = text.replace(/[0-9\u0966-\u096F]/g, "");
  text = text.replace(/[*#_~`^<>\[\]{}()|\\/@$%&+=:;"'\u2018\u2019\u201C\u201D\u2022\u2013\u2014-]/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function extractJson<T>(raw: string): T {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI did not return JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
