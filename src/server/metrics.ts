import * as Log from "@std/log";
import { Counter, Gauge, Registry } from "@wok/prometheus";
import type { Configuration } from "../config/mod.ts";
import type { Hub } from "../hub.ts";
import type { Router } from "./router.ts";

export function initializeMetrics(hub: Hub, router: Router, config: Configuration) {
  Log.debug("Initializing metrics endpoint");
  const registry = Registry.default;

  // region Deno metrics: Memory usage
  const rssMemory = Gauge.with({
    name: "mercure_deno_memory_rss",
    help: "RSS memory usage",
  });
  const heapMemoryUsed = Gauge.with({
    name: "mercure_deno_memory_heap_used",
    help: "Heap used memory usage",
  });
  const heapMemoryTotal = Gauge.with({
    name: "mercure_deno_memory_heap_total",
    help: "Heap total memory usage",
  });
  const memoryExternal = Gauge.with({
    name: "mercure_deno_memory_external",
    help: "External memory usage",
  });
  // endregion

  // region Deno metrics: Runtime information
  const denoVersion = Gauge.with({
    name: "mercure_deno_info",
    help: "Deno version information",
    labels: ["version", "v8", "typescript"],
  });
  const denoStartTime = Gauge.with({
    name: "mercure_deno_start_time",
    help: "Deno process start time",
  });
  // endregion

  // region Mercure metrics: Message events
  const totalSubscribers = Counter.with({
    name: "mercure_subscribers_total",
    help: "Total number of handled subscribers",
  });
  const subscribers = Gauge.with({
    name: "mercure_subscribers_connected",
    help: "Current number of connected subscribers",
  });
  const totalSubscriptions = Counter.with({
    name: "mercure_subscriptions_total",
    help: "Total number of handled subscriptions",
  });
  const subscriptions = Gauge.with({
    name: "mercure_subscriptions",
    help: "Current number of active subscriptions",
    labels: ["topic"],
  });
  const updates = Counter.with({
    name: "mercure_updates",
    help: "Total number of updates dispatched",
    labels: ["topic", "type", "private"],
  });

  hub.addEventListener("connect", () => {
    subscribers.inc();
    totalSubscribers.inc();
  });
  hub.addEventListener("disconnect", () => subscribers.dec());

  hub.addEventListener("subscribe", ({ detail: { subscription } }) => {
    subscriptions.labels({ topic: subscription.topic }).inc();
    totalSubscriptions.inc();
  });

  hub.addEventListener("unsubscribe", ({ detail: { subscription } }) => {
    subscriptions.labels({ topic: subscription.topic }).dec();
  });

  hub.addEventListener("update", ({ data }) => {
    updates
      .labels({
        topic: data.canonicalTopic,
        type: data.type ?? "none",
        private: (data.private ?? false) ? "private" : "public",
      })
      .inc();
  });
  // endregion

  function collectDenoMetrics() {
    const { rss, heapUsed, heapTotal, external } = Deno.memoryUsage();
    rssMemory.set(rss);
    heapMemoryUsed.set(heapUsed);
    heapMemoryTotal.set(heapTotal);
    memoryExternal.set(external);

    const { deno, v8, typescript } = Deno.version;
    denoVersion.labels({ version: deno, v8, typescript }).set(1);
    denoStartTime.set(performance.timeOrigin);
  }

  router.get(config.metricsEndpoint, ({ request }) => {
    collectDenoMetrics();
    const metrics = registry.metrics();

    const userAgent = request.headers.get("user-agent");
    const contentType = userAgent?.includes("Mozilla") ? "text/plain" : "text/plain; version=0.0.4";
    //  : "application/openmetrics-text; version=1.0.0; charset=utf-8";

    return new Response(metrics, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-store, must-revalidate",
        "content-type": contentType,
      },
    });
  });
}
