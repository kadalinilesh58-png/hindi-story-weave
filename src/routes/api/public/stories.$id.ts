import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/cors";

export const Route = createFileRoute("/api/public/stories/$id")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: async ({ request, params }) => {
        const partParam = new URL(request.url).searchParams.get("part");
        const partNumber = partParam ? Number(partParam) : undefined;
        const { getStoryPayload } = await import("@/lib/library.server");
        const payload = await getStoryPayload(
          params.id,
          Number.isFinite(partNumber) ? partNumber : undefined,
        );
        if (!payload) return jsonResponse({ error: "story not found" }, 404);
        return jsonResponse(payload);
      },
    },
  },
});
