import * as Log from "@std/log";
import type { Configuration } from "../config/mod.ts";
import { loadConfiguration } from "../config/mod.ts";
import { Hub } from "../hub.ts";
import { configureLogging } from "../logging.ts";
import { mercurePath, register as registerRoutes } from "../routes.ts";
import { setupTransport } from "../transport.ts";
import { initializeApi } from "./api.ts";
import { createHandler } from "./handler.ts";
import { initializeMetrics } from "./metrics.ts";
import { Router } from "./router.ts";
import { initializeWebUi } from "./web_ui.ts";

export async function server(
  config: Configuration,
  signal?: AbortSignal,
): Promise<Deno.HttpServer<Deno.NetAddr | Deno.UnixAddr>> {
  configureLogging(config);

  const transport = await setupTransport(config);
  const hub = new Hub(transport);

  const router = new Router();
  registerRoutes(router);

  if (config.subscriptionsApi) {
    initializeApi(hub, router, config);
  }

  if (config.webUi) {
    initializeWebUi(router, config);
  }

  if (config.metrics) {
    initializeMetrics(hub, router, config);
  }

  const listenOptions = config.listenAddress!.protocol === "unix:"
    ? { path: config.listenAddress!.pathname }
    : { hostname: config.listenAddress!.hostname, port: Number(config.listenAddress!.port) };

  return Deno.serve({
    ...listenOptions,
    onListen(addr) {
      const hubAddress = "path" in addr
        ? `${addr.transport}://${addr.path}${mercurePath}`
        : `${addr.transport}://${addr.hostname}:${addr.port}${mercurePath}`;

      Log.info(`Mercure Hub listening on ${hubAddress}`);
    },
    signal,
  }, createHandler(router, hub, config));
}

if (import.meta.main) {
  const config = await loadConfiguration(Deno.env);

  await server(config);
}
