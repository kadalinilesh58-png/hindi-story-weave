import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/cors";

export const Route = createFileRoute("/api/public/library")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: async () => {
        const { getLibrary } = await import("@/lib/library.server");
        return jsonResponse(await getLibrary());
      },
    },
  },
});
