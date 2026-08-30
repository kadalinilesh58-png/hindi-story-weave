import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function getLibrary() {
  const supabase = publicClient();
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, summary, latest_part, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: parts } = await supabase
    .from("story_parts")
    .select("id, story_id, part_number, title, status, word_count")
    .order("part_number", { ascending: true });

  return {
    count: stories?.length ?? 0,
    stories: (stories ?? []).map((story) => ({
      id: story.id,
      title: story.title,
      english_summary: story.summary,
      created_at: story.created_at,
      latest_part: story.latest_part,
      parts: (parts ?? [])
        .filter((part) => part.story_id === story.id)
        .map((part) => ({
          id: part.id,
          part: part.part_number,
          title: part.title,
          status: part.status,
          word_count: part.word_count,
          text_url: `/api/public/stories/${story.id}?part=${part.part_number}`,
          download_url: `/api/public/download/${part.id}`,
        })),
    })),
  };
}

export async function getPartText(partId: string) {
  const supabase = publicClient();
  const { data: part } = await supabase
    .from("story_parts")
    .select("id, story_id, part_number, title, status, word_count")
    .eq("id", partId)
    .maybeSingle();
  if (!part) return null;
  const { data: scenes } = await supabase
    .from("story_scenes")
    .select("content")
    .eq("part_id", partId)
    .eq("status", "done")
    .order("idx", { ascending: true });
  const text = (scenes ?? [])
    .map((scene) => (scene.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  return { part, text };
}

export async function getStoryPayload(storyId: string, partNumber?: number) {
  const supabase = publicClient();
  const { data: story } = await supabase
    .from("stories")
    .select("id, title, summary, notes, latest_part, created_at")
    .eq("id", storyId)
    .maybeSingle();
  if (!story) return null;

  const { data: parts } = await supabase
    .from("story_parts")
    .select("id, part_number, title, status, word_count, plan")
    .eq("story_id", storyId)
    .order("part_number", { ascending: true });

  const wanted = partNumber ? (parts ?? []).filter((p) => p.part_number === partNumber) : (parts ?? []);

  const withText = await Promise.all(
    wanted.map(async (part) => {
      const result = await getPartText(part.id);
      return {
        id: part.id,
        part: part.part_number,
        title: part.title,
        status: part.status,
        word_count: part.word_count,
        language: "hindi",
        download_url: `/api/public/download/${part.id}`,
        text: result?.text ?? "",
      };
    }),
  );

  return {
    id: story.id,
    title: story.title,
    english_summary: story.summary,
    notes: story.notes,
    latest_part: story.latest_part,
    created_at: story.created_at,
    parts: withText,
  };
}
