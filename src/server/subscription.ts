import { z } from "zod";
import { earliestEventId, type Hub } from "../hub.ts";
import type { MercureTokenPayload } from "../jws.ts";
import { EventStream, Subscriber } from "../subscribers.ts";
import { Subscription } from "../subscriptions.ts";
import { createTopicSelector, TopicSelector } from "../topic.ts";
import type { Update } from "../updates.ts";
import { HttpError } from "./_errors.ts";
import { authorize, keyResolver } from "./authorization.ts";
import type { HandlerFn } from "./router.ts";

/**
 * Handle a new subscription request.
 *
 * The subscriber subscribes to a URL exposed by a hub to receive updates from
 * one or many topics. To subscribe to updates, the client opens an HTTPS
 * connection following the
 * {@link https://html.spec.whatwg.org/multipage/server-sent-events.html|
 * Server-Sent Events specification} to the hub's subscription URL advertised by
 * the publisher. The GET HTTP method must be used. The connection **SHOULD**
 * use HTTP version 2 or superior to leverage multiplexing and other
 * performance-oriented related features provided by these versions.
 *
 * The subscriber specifies the list of topics to get updates from by using one
 * or several query parameters named `topic`. The `topic` query parameters
 * **MUST** contain topic selectors.
 * See {@link https://mercure.rocks/spec#topic-selectors|topic selectors}.
 *
 * The protocol doesn't specify the maximum number of `topic` parameters that
 * can be sent, but the hub **MAY** apply an arbitrary limit. A subscription is
 * created for every provided topic parameter. See
 * {@link https://mercure.rocks/spec#subscription-events|subscription events}.
 *
 * The {@link https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface|
 * EventSource JavaScript interface} **MAY** be used to establish the
 * connection. Any other appropriate mechanism including, but not limited to,
 * {@link https://www.w3.org/TR/streams-api/|readable streams} and
 * {@link https://xhr.spec.whatwg.org/|XMLHttpRequest} (used by popular
 * polyfills) MAY also be used.
 *
 * The hub sends to the subscriber updates for topics matching the provided
 * topic selectors.
 *
 * If an update is marked as `private`, the hub **MUST NOT** dispatch it to
 * subscribers not authorized to receive it.
 * See {@link https://mercure.rocks/spec#authorization|authorization}.
 *
 * The hub **MUST** send these updates as
 * {@link https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream|
 * `text/event-stream` compliant events}.
 *
 * The `data` property **MUST** contain the new version of the topic. It can be
 * the full resource, or a partial update by using formats such as
 * {@link https://tools.ietf.org/html/rfc6902|JSON Patch} or
 * {@link https://tools.ietf.org/html/rfc7386|JSON Merge Patch}.
 *
 * All other properties defined in the Server-Sent Events specification **MAY**
 * be used and **MUST** be supported by hubs.
 *
 * The resource **SHOULD** be represented in a format with hypermedia
 * capabilities such as {@link https://www.w3.org/TR/json-ld/|JSON-LD},
 * {@link https://tools.ietf.org/html/rfc4287|Atom},
 * {@link https://www.w3.org/TR/xml/|XML} or
 * {@link https://html.spec.whatwg.org/multipage/|HTML}.
 *
 * {@link https://datatracker.ietf.org/doc/html/rfc5988|Web Linking} **SHOULD**
 * be used to indicate the IRI of the resource sent in the event. When using
 * Atom, XML or HTML as the serialization format for the resource, the document
 * **SHOULD** contain a `link` element with a `self` relation containing the IRI
 * of the resource. When using JSON-LD, the document **SHOULD** contain an `@id`
 * property containing the IRI of the resource.
 *
 * The hub **MAY** require subscribers and publishers to be authenticated, and
 * **MAY** apply extra authorization rules not defined in this specification.
 *
 * @example ```ts
 *          // The subscriber subscribes to updates
 *          // for the https://example.com/foo topic, the bar topic,
 *          // and to any topic matching https://example.com/books/{name}
 *          const url = new URL('https://example.com/.well-known/mercure');
 *          url.searchParams.append('topic', 'https://example.com/foo');
 *          url.searchParams.append('topic', 'bar');
 *          url.searchParams.append('topic', 'https://example.com/bar/{id}');
 *
 *          const eventSource = new EventSource(url);
 *
 *          // The callback will be called every time an update is published
 *          eventSource.onmessage = function ({data}) {
 *              Log.log(data);
 *          };
 *          ```
 *
 * @param request
 */
export const handleSubscription = async function handleSubscription(
  { request, url, config, hub },
) {
  const claims = await authorize(
    request,
    config,
    keyResolver("subscriber"),
  );

  if (!url.searchParams.has("topic")) {
    throw new HttpError(400, `The "topic" query parameter is required`);
  }

  // Extract the topic selectors from the query parameters.
  const topicSelectors = url.searchParams
    .getAll("topic")
    .filter(Boolean)
    .map((selector) => createTopicSelector(decodeURIComponent(selector), url));

  // Ensure that at least one topic selector is provided, as required by the
  // specification.
  if (topicSelectors.length === 0) {
    throw new HttpError(
      400,
      `The "topic" query parameter may not be empty`,
    );
  }

  // TODO: Implement optional maximum number of subscription topics check here

  const [authorizedTopics, payload] = checkClaims(claims, url);
  const lastEventId = extractLastEventId(request);
  const {
    readable,
    writable,
  } = new TransformStream<Uint8Array, Uint8Array>();

  // Create a new subscriber bound to the transform stream. It will serve as
  // the bridge to the client, keeping a reference to the SSE stream.
  const subscriber = new Subscriber(
    new EventStream(writable),
    lastEventId,
    authorizedTopics,
    payload,
  );

  if (config.heartbeatInterval) {
    subscriber.enableHeartbeats(+config.heartbeatInterval);
  }

  const subscriptions = topicSelectors.map((selector) => new Subscription(subscriber, selector));

  if (lastEventId) {
    // Reconcile the subscriber with the last event ID sent by the client.
    // This will send all updates that occurred since the client's last
    // event ID.
    await reconcile(hub, subscriber, {
      lastEventId,
      anonymousAccess: config.anonymousAccess,
    });
  }

  // Dispatch a subscription event to the hub for each topic selector.
  await Promise.all(subscriptions.map((subscription) =>
    hub.dispatchEvent(
      new CustomEvent("subscribe", { detail: { subscription } }),
    )
  ));

  // Subscribe the subscriber for updates, if they are eligible to receive it.
  const unsubscribe = hub.addEventListener("update", ({ data }) =>
    sendUpdate(
      subscriber,
      data,
      config.anonymousAccess,
    ));

  // When the client closes the connection, we can use the request's abort
  // signal to close the subscriber cleanly and remove it from the list.
  request.signal.addEventListener("abort", () => {
    void subscriber.close();
    unsubscribe();

    hub.dispatchEvent(new CustomEvent("disconnect", { detail: { subscriber } }));
  });

  // Dispatch a connection event to the hub to notify that a new subscriber
  // has connected.
  hub.dispatchEvent(new CustomEvent("connect", { detail: { subscriber } }));

  // Dispatch the response to the client immediately: The SSE stream is
  // asynchronous and will be updated as messages are sent.
  return new Response(readable, {
    headers: {
      "transfer-encoding": "chunked",
      "content-type": "text/event-stream",

      // Disable cache, even for old browsers and proxies
      "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
      "pragma": "no-cache",
      "expire": "0",

      // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Keep-Alive
      "connection": "keep-alive",

      // Disable proxy buffering in nginx to ensure that the client receives
      // See https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering
      "x-accel-buffering": "no",

      ...lastEventId ? { "last-event-id": subscriber.lastEventId! } : undefined,
    },
  });
} satisfies HandlerFn;

function sendUpdate(subscriber: Subscriber, update: Update, anonymousAccess = false) {
  if (!subscriber.canAccess(update, anonymousAccess)) {
    return Promise.resolve();
  }

  return subscriber.dispatch(update);
}

async function reconcile(
  hub: Hub,
  subscriber: Subscriber,
  { anonymousAccess, lastEventId }: { lastEventId?: string; anonymousAccess?: boolean } = {},
) {
  const updates = hub.eventsAfter(
    lastEventId ?? earliestEventId,
  );

  for await (const update of updates) {
    void sendUpdate(subscriber, update, anonymousAccess);
  }
}

function extractLastEventId(request: Request) {
  const url = new URL(request.url);
  const lastEventId = request.headers.get("Last-Event-ID") ??
    url.searchParams.get("lastEventId") ??
    url.searchParams.get("last-event-id");

  return lastEventId ?? undefined;
}

function checkClaims(
  claims: MercureTokenPayload | undefined,
  baseUrl: URL,
): [TopicSelector[], Record<string, unknown> | undefined] {
  if (!claims) {
    return [[], undefined];
  }

  if (!claims.mercure) {
    throw new HttpError(403, `Forbidden: Missing "mercure" claim`);
  }

  let topics: TopicSelector[];
  let payload: Record<string, unknown> | undefined;

  try {
    const properties = JSON.parse(claims.mercure.toString());
    const data = z
      .object({
        payload: z.record(z.unknown()).optional(),
        subscribe: z
          .array(z.string(), {
            message: "Invalid subscribe claim",
          })
          .transform((topics) => topics.map((topic) => new TopicSelector(topic, baseUrl))),
      })
      .parse(properties);

    ({ subscribe: topics, payload } = data);
  } catch (cause) {
    throw new HttpError(
      403,
      `Forbidden: Invalid "mercure" claim: ${cause}`,
      {},
      cause,
    );
  }

  return [topics, payload];
}
