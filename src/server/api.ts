import * as Log from "@std/log";
import type { Configuration } from "../config/mod.ts";
import type { Hub } from "../hub.ts";
import { mercurePath } from "../routes.ts";
import type { Subscriber } from "../subscribers.ts";
import type { Subscription } from "../subscriptions.ts";
import { generateId } from "../updates.ts";
import type { HandlerFn, Router } from "./router.ts";
import { asset, assets, json, redirect } from "./utils.ts";

const subscribers = new Set<Subscriber>();
const subscriptions = new Set<Subscription>();

export function initializeApi(hub: Hub, router: Router, config: Configuration) {
  Log.debug("Initializing Subscriptions API");

  router.get(`${mercurePath}/subscriptions{/:topic}?`, listSubscriptions);
  router.get(`${mercurePath}/subscribers`, listSubscribers);

  // When a new subscription is created, add it to the list of active
  // subscriptions. When the subscription is closed, remove it from the list.
  // This way, we can passively keep track of all active subscriptions.
  hub.addEventListener("connect", ({ detail: { subscriber } }) => {
    subscribers.add(subscriber);
    subscriber.subscriptions.forEach((subscription) => subscriptions.add(subscription));
    Log.debug("Subscriber connected", { current: subscribers.size });

    subscriber.addEventListener("close", () => {
      subscribers.delete(subscriber);
      subscriber.subscriptions.forEach((subscription) => subscriptions.delete(subscription));

      Log.debug("Subscriber disconnected", {
        current: subscribers.size,
      });
    });

    subscriber.subscriptions.forEach((subscription) => {
      const encodedTopic = encodeURIComponent(subscription.topic);
      const encodedId = encodeURIComponent(subscriber.id);

      hub.dispatchEvent(
        new MessageEvent("update", {
          data: {
            id: generateId(),
            canonicalTopic: `/.well-known/mercure/subscriptions/${encodedTopic}/${encodedId}`,
            alternateTopics: [
              `/.well-known/mercure/subscriptions/${encodedTopic}`,
              `/.well-known/mercure/subscriptions`,
            ],
            data: JSON.stringify({
              "@context": "https://mercure.rocks/",
              id: `/.well-known/mercure/subscriptions/${subscription.id}`,
              type: "Subscription",
              topic: subscription.topic,
              subscriber: subscriber.id,
              active: subscriber.active,
              payload: subscriber.payload,
            }),
          },
        }),
      );
    });
  });
}

export const listSubscriptions = function listSubscriptions(
  { parameters: { topic } },
) {
  const filteredSubscriptions = topic
    ? Array
      .from(subscriptions)
      .filter((subscription) => subscription.match([topic]))
    : Array.from(subscriptions);

  return json({ subscriptions: filteredSubscriptions });
} satisfies HandlerFn;

export function listSubscribers() {
  return json({ subscribers: Array.from(subscribers) });
}
