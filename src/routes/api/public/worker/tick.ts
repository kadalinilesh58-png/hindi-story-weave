import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/cors";

async function handle(request: Request) {
  const url = new URL(request.url);
  let partId = url.searchParams.get("partId") ?? undefined;
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { partId?: string };
      partId = body.partId ?? partId;
    } catch {
      // empty body is fine
    }
  }
  const { runTick } = await import("@/lib/story-worker.server");
  const result = await runTick(partId);
  return jsonResponse(result);
}

export const Route = createFileRoute("/api/public/worker/tick")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
