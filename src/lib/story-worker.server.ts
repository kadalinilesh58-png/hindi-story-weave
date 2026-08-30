import {
  buildPlan,
  recapPart,
  sceneRows,
  writeScene,
  countWords,
  SCENES_PER_CHAPTER,
  TARGET_WORDS,
  type StoryPlan,
} from "./story-engine.server";

const BATCH = 3;
const STALE_MS = 5 * 60 * 1000;

export type TickResult = {
  state: "idle" | "planning" | "writing" | "done" | "error";
  partId?: string;
  wordCount?: number;
  totalScenes?: number;
  doneScenes?: number;
  message?: string;
};

export async function runTick(partId?: string): Promise<TickResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let partQuery = supabaseAdmin
    .from("story_parts")
    .select("*")
    .in("status", ["planning", "writing"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (partId) {
    partQuery = supabaseAdmin.from("story_parts").select("*").eq("id", partId).limit(1);
  }
  const { data: parts, error: partError } = await partQuery;
  if (partError) throw new Error(partError.message);
  const part = parts?.[0];
  if (!part) return { state: "idle" };
  if (part.status === "done") return { state: "done", partId: part.id, wordCount: part.word_count };

  const { data: story } = await supabaseAdmin
    .from("stories")
    .select("*")
    .eq("id", part.story_id)
    .maybeSingle();
  if (!story) throw new Error("कहानी नहीं मिली");

  try {
    if (part.status === "planning") {
      let recap = "";
      if (part.part_number > 1) {
        const { data: prev } = await supabaseAdmin
          .from("story_parts")
          .select("id")
          .eq("story_id", part.story_id)
          .eq("part_number", part.part_number - 1)
          .maybeSingle();
        if (prev) {
          const { data: prevScenes } = await supabaseAdmin
            .from("story_scenes")
            .select("content")
            .eq("part_id", prev.id)
            .eq("status", "done")
            .order("idx", { ascending: true });
          const text = (prevScenes ?? []).map((s) => s.content ?? "").join("\n\n");
          if (text.trim()) recap = await recapPart(text);
        }
      }

      const plan = await buildPlan(story.summary, story.notes, part.part_number, recap);
      const rows = sceneRows(plan, part.id);
      const { error: insertError } = await supabaseAdmin.from("story_scenes").insert(rows);
      if (insertError) throw new Error(insertError.message);
      await supabaseAdmin
        .from("story_parts")
        .update({
          plan: plan as unknown as Record<string, unknown>,
          title: plan.title,
          status: "writing",
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", part.id);
      if (part.part_number === 1) {
        await supabaseAdmin.from("stories").update({ title: plan.title }).eq("id", story.id);
      }
      return { state: "writing", partId: part.id, wordCount: 0, totalScenes: rows.length, doneScenes: 0 };
    }

    const plan = part.plan as unknown as StoryPlan;
    const stale = new Date(Date.now() - STALE_MS).toISOString();

    const { data: candidates } = await supabaseAdmin
      .from("story_scenes")
      .select("id, idx, brief, chapter_title, status, claimed_at, attempts")
      .eq("part_id", part.id)
      .neq("status", "done")
      .order("idx", { ascending: true })
      .limit(20);

    const claimable = (candidates ?? []).filter(
      (s) => s.status === "pending" || (s.claimed_at ?? "") < stale,
    );
    const batch = claimable.slice(0, BATCH);

    if (batch.length === 0 && (candidates ?? []).length > 0) {
      return await progress(part.id);
    }

    if (batch.length === 0) {
      // Nothing left to write in this part.
      const { count: total } = await supabaseAdmin
        .from("story_scenes")
        .select("id", { count: "exact", head: true })
        .eq("part_id", part.id);
      const words = await sumWords(part.id);
      if (words < (part.target_words ?? TARGET_WORDS)) {
        await addExtraScenes(part.id, plan, total ?? 0);
        return { state: "writing", partId: part.id, wordCount: words };
      }
      await supabaseAdmin
        .from("story_parts")
        .update({ status: "done", word_count: words, updated_at: new Date().toISOString() })
        .eq("id", part.id);
      return { state: "done", partId: part.id, wordCount: words };
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("story_scenes")
      .update({ status: "writing", claimed_at: nowIso })
      .in(
        "id",
        batch.map((s) => s.id),
      );

    const firstIdx = batch[0]!.idx;
    const { data: tailRows } = await supabaseAdmin
      .from("story_scenes")
      .select("content")
      .eq("part_id", part.id)
      .eq("status", "done")
      .lt("idx", firstIdx)
      .order("idx", { ascending: false })
      .limit(1);
    const previousTail = (tailRows?.[0]?.content ?? "").slice(-900);

    const isLastPart = part.part_number >= 5;

    await Promise.allSettled(
      batch.map(async (scene) => {
        try {
          const content = await writeScene({
            plan,
            brief: scene.brief,
            chapterTitle: scene.chapter_title,
            previousTail,
            isFinalScene:
              plan?.chapters != null &&
              scene.idx === plan.chapters.length * SCENES_PER_CHAPTER - 1 &&
              (await sumWords(part.id)) + 700 >= (part.target_words ?? TARGET_WORDS),
            isLastPart,
          });
          const words = countWords(content);
          if (words < 120) throw new Error("बहुत छोटा हिस्सा मिला");
          await supabaseAdmin
            .from("story_scenes")
            .update({
              content,
              word_count: words,
              status: "done",
              attempts: (scene.attempts ?? 0) + 1,
            })
            .eq("id", scene.id);
        } catch {
          await supabaseAdmin
            .from("story_scenes")
            .update({ status: "pending", claimed_at: null, attempts: (scene.attempts ?? 0) + 1 })
            .eq("id", scene.id);
        }
      }),
    );

    return await progress(part.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("story_parts")
      .update({ error: message, updated_at: new Date().toISOString() })
      .eq("id", part.id);
    return { state: "error", partId: part.id, message };
  }
}

async function sumWords(partId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("story_scenes")
    .select("word_count")
    .eq("part_id", partId)
    .eq("status", "done");
  return (data ?? []).reduce((sum, row) => sum + (row.word_count ?? 0), 0);
}

async function progress(partId: string): Promise<TickResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const words = await sumWords(partId);
  const { count: total } = await supabaseAdmin
    .from("story_scenes")
    .select("id", { count: "exact", head: true })
    .eq("part_id", partId);
  const { count: done } = await supabaseAdmin
    .from("story_scenes")
    .select("id", { count: "exact", head: true })
    .eq("part_id", partId)
    .eq("status", "done");
  await supabaseAdmin
    .from("story_parts")
    .update({ word_count: words, updated_at: new Date().toISOString() })
    .eq("id", partId);
  return {
    state: "writing",
    partId,
    wordCount: words,
    totalScenes: total ?? 0,
    doneScenes: done ?? 0,
  };
}

async function addExtraScenes(partId: string, plan: StoryPlan, startIdx: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lastChapter = plan?.chapters?.[plan.chapters.length - 1];
  const rows = Array.from({ length: 8 }, (_, i) => ({
    part_id: partId,
    idx: startIdx + i,
    chapter_no: lastChapter?.no ?? 1,
    chapter_title: lastChapter?.title ?? "आगे की कहानी",
    brief: `कहानी को यहाँ से आगे बढ़ाओ। नए मोड़, नई मुश्किल और किरदारों की भावना के साथ। ${
      lastChapter?.outline ?? ""
    }`,
  }));
  await supabaseAdmin.from("story_scenes").insert(rows);
}
