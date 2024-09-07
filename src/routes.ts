import { handlePublication } from "./server/publication.ts";
import type { Router } from "./server/router.ts";
import { handleSubscription } from "./server/subscription.ts";

export function register(router: Router) {
  router.get(mercurePath, handleSubscription);
  router.post(mercurePath, handlePublication);
}

/**
 * The URL of the hub MUST be the "well-known" (RFC5785) fixed
 * path /.well-known/mercure.
 *
 * @see https://mercure.rocks/spec#discovery
 * @see https://tools.ietf.org/html/rfc5785
 */
export const mercurePath = "/.well-known/mercure";
