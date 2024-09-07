import { getCookies } from "@std/http";
import type { Configuration } from "../config/mod.ts";
import { type JsonWebKey, verifyJwt } from "../jws.ts";
import { HttpError } from "./_errors.ts";

/**
 * Authorization
 * -------------
 * To ensure that they are authorized, both publishers and subscribers must
 * present a valid {@link https://tools.ietf.org/html/rfc7515|JWS (RFC7515)} in
 * compact serialization to the hub. This JWS **SHOULD** be short-lived,
 * especially if the subscriber is a web browser. A different key **MAY** be
 * used to sign subscribers' and publishers' tokens.
 *
 * Three mechanisms are defined to present the JWS to the hub:
 *  - using an `Authorization` HTTP header
 *  - using a cookie
 *  - using an `authorization` URI query parameter
 *
 * When using any authorization mechanism, the connection **MUST** use an
 * encryption layer such as HTTPS.
 *
 * If an `Authorization` HTTP header is presented by the client, the JWS it
 * contains **MUST** be used. The content of the `authorization` query parameter
 * and of the cookie **MUST** be ignored.
 *
 * If an `authorization` query parameter is set by the client and no
 * `Authorization` HTTP header is presented, the content of the query parameter
 * **MUST** be used, the content of the cookie must be ignored.
 *
 * If the client tries to execute an operation it is not allowed to, a 403 HTTP
 * status code **SHOULD** be returned.
 *
 * ### Authorization HTTP Header
 * If the publisher or the subscriber is not a web browser, it **SHOULD** use an
 * `Authorization` HTTP header. This `Authorization` header **MUST** contain the
 * string `Bearer` followed by a space character and by the JWS. The hub will
 * check that the JWS conforms to the rules (defined later) ensuring that the
 * client is authorized to publish or subscribe to updates.
 *
 * ### Cookie
 * By the
 * {@link https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface|
 * `EventSource` specification}, web browsers can not set custom HTTP headers for
 * such connections, and they can only be established using the `GET` HTTP
 * method. However, cookies are supported and can be included even in
 * cross-domain requests if
 * {@link https://html.spec.whatwg.org/multipage/server-sent-events.html#dom-eventsourceinit-withcredentials|
 * the CORS credentials are set}.
 *
 * If the publisher or the subscriber is a web browser, it **SHOULD**, whenever
 * possible, send a cookie containing the JWS when connecting to the hub. It is
 * **RECOMMENDED** to name the cookie `mercureAuthorization`, but it may be
 * necessary to use a different name to prevent conflicts when using multiple
 * hubs on the same domain.
 *
 * The cookie **SHOULD** be set during discovery to improve the overall
 * security. Consequently, if the cookie is set during discovery, both the
 * publisher and the hub have to share the same second level domain. The Domain
 * attribute **MAY** be used to allow the publisher and the hub to use different
 * subdomains. See {@link https://mercure.rocks/spec#discovery|discovery}.
 *
 * The cookie **SHOULD** have the `Secure`, `HttpOnly` and `SameSite` attributes
 * set. The cookie's `Path` attribute **SHOULD** also be set to the hub's URL.
 * See {@link https://mercure.rocks/spec#security-considerations|security
 * considerations}.
 *
 * ### URI Query Parameter
 * If it's not possible for the client to use an `Authorization` HTTP header nor
 * a cookie, the JWS can be passed as a request URI query component as defined
 * by {@link https://tools.ietf.org/html/rfc3986|Uniform Resource Identifier
 * (URI): Generic Syntax (RFC3986)}, using the `authorization` parameter.
 *
 * The `authorization` query parameter **MUST** be properly separated from the
 * `topic` parameter and from other request-specific parameters using `&`
 * character(s) (ASCII code 38).
 *
 * For example, the client makes the following HTTP request using
 * transport-layer security:
 * ```http
 * GET /.well-known/mercure?topic=https://example.com/books/foo&authorization=<JWS> HTTP/1.1
 * Host: hub.example.com
 * ```
 *
 * Clients using the URI Query Parameter method **SHOULD** also send a
 * `Cache-Control` header containing the `no-store` option. Server success
 * (2XX status) responses to these requests **SHOULD** contain a `Cache-Control`
 * header with the `private` option.
 *
 * Because of the security weaknesses associated with the URI method (see
 * security considerations), including the high likelihood that the URL
 * containing the access token will be logged, it **SHOULD** NOT be used unless
 * it is impossible to transport the access token in the `Authorization` request
 * header field or in a secure cookie. Hubs **MAY** support this method.
 *
 * This method is not recommended due to its security deficiencies.
 *
 * @param request
 * @param config
 * @param keyResolver
 * @see https://mercure.rocks/spec#authorization Authorization
 */
export async function authorize(
  request: Request,
  config: Configuration,
  keyResolver: (config: Configuration) => Promise<JsonWebKey>,
) {
  const authorization = request.headers.get("authorization");

  // If an Authorization HTTP header is presented by the client, the JWS it
  // contains MUST be used. The content of the authorization query parameter
  // and of the cookie MUST be ignored.
  if (authorization) {
    const [type, token] = authorization.split(" ", 2);

    if (type !== "Bearer" || !token) {
      throw new HttpError(401, "Unauthorized", {
        "WWW-Authenticate": 'Bearer realm="mercure", error="invalid_token"',
      });
    }

    return parseToken(token, await keyResolver(config));
  }

  // If an authorization query parameter is set by the client and no
  // Authorization HTTP header is presented, the content of the query
  // parameter MUST be used, the content of the cookie must be ignored.
  if (config.queryParamAuthorization) {
    const queryParams = new URL(request.url).searchParams;
    const token = queryParams.get("authorization");

    if (token) {
      return parseToken(token, await keyResolver(config));
    }
  }

  const cookies = getCookies(request.headers);
  const token = cookies[config.cookieName] ?? undefined;

  if (!token && !config.anonymousAccess) {
    throw new HttpError(401, "Unauthorized", {
      "WWW-Authenticate": 'Bearer realm="mercure"',
    });
  }

  let origin = request.headers.get("origin") ?? undefined;

  if (!origin) {
    const originHeader = request.headers.get("referer") ??
      request.headers.get("referrer");
    origin = originHeader ? new URL(originHeader).origin : undefined;
  }

  if (
    origin &&
    !config.allowedOrigins.includes(origin) &&
    !config.allowedOrigins.includes("*")
  ) {
    throw new HttpError(403, "Forbidden");
  }

  return token ? parseToken(token, await keyResolver(config)) : undefined;
}

export function keyResolver(audience: "publisher" | "subscriber") {
  return async function resolveKey(config: Configuration) {
    if (audience === "publisher") {
      return config.publishJwksUrl ? await config.publishJwksUrl() : config.publishJwk[0];
    }

    return config.subscribeJwksUrl ? await config.subscribeJwksUrl() : config.subscribeJwk[0];
  };
}

async function parseToken(token: string, jwk: JsonWebKey) {
  try {
    const { payload } = await verifyJwt(jwk, token);

    return payload;
  } catch (cause) {
    throw new HttpError(403, "Forbidden", {}, cause);
  }
}
