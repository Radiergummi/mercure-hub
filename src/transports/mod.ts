import type { MaybePromise } from "../server/utils.ts";
import type { Subscriber } from "../subscribers.ts";
import type { Subscription } from "../subscriptions.ts";
import type { Update } from "../updates.ts";

export const transports: Transports = new Map();

/**
 * Register a transport instance to be used by the server.
 *
 * @param transport
 */
export function registerTransport<T extends Protocol>(transport: Transport<T>) {
  transports.set(transport.protocol, transport);

  return transport;
}

export async function createTransport(
  uri: URL,
  enableSubscriptionEvents = false,
) {
  const transport = transports.get(uri.protocol as Protocol);

  if (!transport) {
    throw new Error(
      `Transport connection failed: "${uri.protocol}": No such transport`,
    );
  }

  await transport.connect(uri, enableSubscriptionEvents);

  return transport;
}

export type Transport<T extends Protocol = Protocol> = {
  protocol: T;
  connect(
    uri: URL,
    enableSubscriptionEvents: boolean,
  ): MaybePromise<void>;
  dispatchEvent<K extends keyof EventMap>(event: EventMap[K]): boolean;
  eventsAfter(lastEventId: string): AsyncGenerator<Update>;
  close(): MaybePromise<void>;

  addEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]>,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]>,
  ): void;
};

type Protocol = `${string}:`;
type Transports<T extends Protocol = Protocol> = Map<T, Transport<T>>;

export type MessageEventListener<T extends Event> = (event: T) => unknown;

export type NewConnection = {
  subscriber: Subscriber;
};

export type ClosedConnection = {
  subscriber: Subscriber;
};

export type NewSubscription = {
  subscription: Subscription;
};

export type CancelledSubscription = {
  subscription: Subscription;
};

export type EventMap = {
  update: MessageEvent<Update>;
  subscribe: CustomEvent<NewSubscription>;
  unsubscribe: CustomEvent<CancelledSubscription>;
  connect: CustomEvent<NewConnection>;
  disconnect: CustomEvent<ClosedConnection>;
};
