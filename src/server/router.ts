import type { Configuration } from "../config/mod.ts";
import type { Hub } from "../hub.ts";
import { HttpError } from "./_errors.ts";
import type { MaybePromise } from "./utils.ts";

/**
 * A simple router implementation.
 *
 * This router allows you to register handlers for specific routes and HTTP
 * methods. When a request is passed to the router, it will try to match the
 * request against the registered routes and return the appropriate handler.
 *
 * If no route matches the request, or no handler has been registered for the
 * request's method, the router will return a handler that throws a 404 or 405
 * error on invocation.
 */
export class Router {
  /**
   * Registered routes.
   *
   * @private
   */
  public readonly routes: Map<URLPattern, Map<Verb, HandlerFn>>;

  /**
   * Cached URL patterns.
   *
   * @private
   */
  readonly #patterns = new Map<string, URLPattern>();

  public constructor(
    routes: Map<URLPattern, Map<Verb, HandlerFn>> = new Map(),
  ) {
    this.routes = routes;
  }

  /**
   * Match a request against the registered routes.
   *
   * This method will return a handler function and any path parameters
   * extracted from the request's URL.
   * If no route matches the request, or no suitable handler for the request
   * method can be found, `match` will still yield a handler that will throw
   * a 404 or 405 error on invocation.
   *
   * @param request
   */
  match(request: Request) {
    // Iterate all patterns registered with the router. In the future, if
    // the URLPatternList API is available, we could use that instead to
    // improve performance (right now, the resolution of the URLPattern
    // instances is O(n)).
    for (const [pattern, handlers] of this.routes) {
      // We'll try to match the request's URL against the current pattern.
      const match = pattern.exec(request.url);

      // We have a matching pattern for the request; now, we can check if
      // there also is a handler for the request's method.
      if (match) {
        const verb = request.method.toLowerCase() as Verb;
        const handler = handlers.get(verb);

        // We have a matching pattern and method handler, so we'll
        // return the handler instance along with any path matches from
        // the request URI.
        if (handler) {
          return [handler, match.pathname.groups] as const;
        }

        // We have a matching pattern, but no handler for the request's
        // method. We'll return a "405: Method Not Allowed" response,
        // and include the allowed methods.
        return [() => {
          throw new HttpError(
            405,
            "Method not allowed",
            {
              allow: Array.from(handlers.keys())
                .map((verb) => verb.toUpperCase())
                .join(", "),
            },
          );
        }, {}] as const;
      }
    }

    // No matching pattern was found for the request, so we'll return a
    // "404: Not Found" response.
    return [() => {
      throw new HttpError(404, "Not Found");
    }, {}] as const;
  }

  /**
   * Register a handler for a given route and HTTP verb(s).
   *
   * @param verbs
   * @param route
   * @param handler
   */
  public register(
    verbs: [Verb, ...Verb[]],
    route: string,
    handler: HandlerFn,
  ) {
    const pattern = this.#buildPattern(route);

    // Create a handler map, so we can look up handlers by verb quickly
    const handlers = this.routes.get(pattern) ??
      new Map<Verb, HandlerFn>();
    verbs.forEach((verb) => handlers.set(verb, handler));

    this.routes.set(pattern, handlers);
  }

  get(pattern: string, handler: HandlerFn) {
    this.register(["get"], pattern, handler);
  }

  post(pattern: string, handler: HandlerFn) {
    this.register(["post"], pattern, handler);
  }

  put(pattern: string, handler: HandlerFn) {
    this.register(["put"], pattern, handler);
  }

  patch(pattern: string, handler: HandlerFn) {
    this.register(["patch"], pattern, handler);
  }

  delete(pattern: string, handler: HandlerFn) {
    this.register(["delete"], pattern, handler);
  }

  options(pattern: string, handler: HandlerFn) {
    this.register(["options"], pattern, handler);
  }

  head(pattern: string, handler: HandlerFn) {
    this.register(["head"], pattern, handler);
  }

  connect(pattern: string, handler: HandlerFn) {
    this.register(["connect"], pattern, handler);
  }

  search(pattern: string, handler: HandlerFn) {
    this.register(["search"], pattern, handler);
  }

  trace(pattern: string, handler: HandlerFn) {
    this.register(["trace"], pattern, handler);
  }

  all(pattern: string, handler: HandlerFn) {
    this.register(["*"], pattern, handler);
  }

  #buildPattern(pattern: string) {
    const urlPattern = this.#patterns.get(pattern) ??
      new URLPattern({ pathname: pattern });

    this.#patterns.set(pattern, urlPattern);

    return urlPattern;
  }
}

export type RequestContext = {
  parameters: Record<string, string | undefined>;
  request: Request;
  config: Configuration;
  hub: Hub;
  url: URL;
};

export type HandlerFn = (context: RequestContext) => MaybePromise<Response>;

type WildcardVerb = "*";
type Verb =
  | WildcardVerb
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head"
  | "connect"
  | "search"
  | "trace";
