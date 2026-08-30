import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CreateInput = z.object({
  summary: z.string().min(80),
  notes: z.string().optional(),
});

export const createStory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: story, error } = await supabaseAdmin
      .from("stories")
      .insert({
        summary: data.summary.trim(),
        notes: data.notes?.trim() || null,
        title: "नई मंगा कहानी",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: part, error: partError } = await supabaseAdmin
      .from("story_parts")
      .insert({ story_id: story.id, part_number: 1, status: "planning" })
      .select("id")
      .single();
    if (partError) throw new Error(partError.message);

    return { storyId: story.id, partId: part.id };
  });

export const requestNextPart = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ storyId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parts } = await supabaseAdmin
      .from("story_parts")
      .select("id, part_number, status")
      .eq("story_id", data.storyId)
      .order("part_number", { ascending: false });

    const last = parts?.[0];
    if (!last) throw new Error("इस कहानी का कोई भाग नहीं मिला");
    if (last.status !== "done") throw new Error("पहले चल रहा भाग पूरा होने दें");
    if (last.part_number >= 5) throw new Error("पाँचवें भाग में कहानी पूरी हो चुकी है");

    const nextNumber = last.part_number + 1;
    const { data: part, error } = await supabaseAdmin
      .from("story_parts")
      .insert({ story_id: data.storyId, part_number: nextNumber, status: "planning" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("stories").update({ latest_part: nextNumber }).eq("id", data.storyId);
    return { partId: part.id, partNumber: nextNumber };
  });

export const tickPart = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ partId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { runTick } = await import("@/lib/story-worker.server");
    return await runTick(data.partId);
  });
