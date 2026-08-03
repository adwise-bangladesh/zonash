// Thin server-function wrapper. Module scope must stay free of runtime helpers
// (server-fn splitting deletes siblings) — all logic lives in *.server.ts.

import { createServerFn } from "@tanstack/react-start";

export const getSiteIdentity = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveSiteIdentity } = await import("./site-identity.server");
  return resolveSiteIdentity();
});
