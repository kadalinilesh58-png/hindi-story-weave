import { createFileRoute } from "@tanstack/react-router";
import { corsHeaders, jsonResponse, preflight } from "@/lib/cors";

export const Route = createFileRoute("/api/public/download/$partId")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: async ({ params }) => {
        const { getPartText } = await import("@/lib/library.server");
        const result = await getPartText(params.partId);
        if (!result) return jsonResponse({ error: "part not found" }, 404);
        const heading = `${result.part.title}\nभाग ${result.part.part_number}\n\n`;
        return new Response(heading + result.text, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-disposition": `attachment; filename="manga-part-${result.part.part_number}-${result.part.id}.txt"`,
            ...corsHeaders,
          },
        });
      },
    },
  },
});
