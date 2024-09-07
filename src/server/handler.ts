import * as Log from "@std/log";
import { Histogram } from "@wok/prometheus";
import type { Configuration } from "../config/mod.ts";
import type { Hub } from "../hub.ts";
import { HttpError, type ResponsableError, ValidationError } from "./_errors.ts";
import type { Router } from "./router.ts";
import { resolveAcceptedMediaTypes } from "./utils.ts";

export function createHandler(
  router: Router,
  hub: Hub,
  config: Configuration,
): Deno.ServeHandler & Deno.ServeUnixHandler {
  return async function respond(request) {
    performance.mark("request");

    const [handler, parameters] = router.match(request);
    let response;

    try {
      response = await handler({
        parameters,
        request,
        config,
        hub,
        url: new URL(request.url),
      });
    } catch (error) {
      Log.error(error, { cause: error.cause });

      response = handleError(request, error);
    } finally {
      const { duration } = performance.measure("request", {
        start: "request",
      });
      const { status } = response!;

      Log.debug(
        `Handled request  [${status}] ${request.method} ${request.url} — ${duration}ms`,
        {
          method: request.method,
          url: request.url,
          duration,
          status,
        },
      );

      if (config.metrics) {
        trackExchange(request, response!, duration);
      }
    }

    return withGenericHeaders(response);
  };
}

const latency = Histogram.with({
  name: "mercure_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds.",
  labels: ["method", "status"],
  buckets: [0.001, 0.01, 0.1, 0.3, 0.5, 1.2, 5, 10],
});

function trackExchange(request: Request, response: Response, duration: number) {
  const method = request.method;
  const status = response.status.toString();

  latency.labels({ method, status }).observe(duration / 1_000);
}

function handleError(request: Request, error: Error) {
  const accept = resolveAcceptedMediaTypes(request);
  const acceptsJSON = accept.some((type) => type === "application/json");
  let payload: ResponsableError;

  switch (true) {
    case error instanceof HttpError:
      payload = error;
      break;

    case error instanceof ValidationError:
      payload = error;
      break;

    default:
      payload = new HttpError(
        500,
        "Internal Server Error",
        {},
        error,
      );
  }

  return new Response(
    acceptsJSON ? JSON.stringify(payload) : payload.toString(),
    {
      status: payload.status,
      headers: {
        "content-type": acceptsJSON
          ? "application/json; charset=utf-8"
          : "text/plain; charset=utf-8",
        ...payload.headers,
      },
    },
  );
}

function withGenericHeaders(response: Response) {
  response.headers.set("server", "Mercure/0.0.1 (Deno)");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-xss-protection", "1; mode=block");
  response.headers.set("referrer-policy", "same-origin");

  return response;
}
