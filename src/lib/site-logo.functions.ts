// Thin server-function wrapper. Module scope must stay free of runtime helpers
// (server-fn splitting deletes siblings) — all logic lives in *.server.ts.

import { createServerFn } from "@tanstack/react-start";

export const getSiteLogo = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveSiteLogo } = await import("./site-logo.server");
  return resolveSiteLogo();
});
