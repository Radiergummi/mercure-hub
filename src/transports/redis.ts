import { connect, type Redis } from "redis";
import { earliestEventId } from "../hub.ts";
import { generateId, type Update } from "../updates.ts";
import type { EventMap, MessageEventListener, Transport } from "./mod.ts";
import * as Log from "@std/log";

export class RedisTransport implements Transport<"redis:"> {
  public readonly protocol = "redis:";
  #_connection: Redis | undefined;
  #_subscription: StreamSubscription | undefined;
  #target = new EventTarget();

  constructor(
    public readonly limit = Infinity,
    public readonly readTimeout = 5_000,
  ) {}

  async connect(uri: URL, _enableSubscriptionEvents: boolean) {
    this.#_connection = await connect(uri);
    this.#_subscription = new StreamSubscription(
      await connect(uri),
      ["update", "connect", "disconnect", "subscribe", "unsubscribe"],
      this.readTimeout,
    );

    void this.#listen();
  }

  close() {
    this.#connection.close();
    this.#subscription.close();
  }

  async *eventsAfter(lastEventId: string) {
    const [{ messages }] = await this.#connection.xread(
      [{ key: "update", xid: "$" }],
      { block: 0 },
    );
    let next = lastEventId === earliestEventId;

    for (const { fieldValues: { payload, id } } of messages) {
      if (next) {
        yield this.#hydrate({ payload, id });
      }

      if (id === lastEventId) {
        next = true;
      }
    }
  }

  removeEventListener<K extends keyof EventMap>(
    _type: K,
    listener: MessageEventListener<EventMap[K]>,
  ) {
    this.#target.removeEventListener(
      _type,
      listener as EventListener,
    );
  }

  addEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]>,
    options?: AddEventListenerOptions,
  ) {
    this.#target.addEventListener(
      type,
      listener as EventListener,
      options,
    );
  }

  dispatchEvent<K extends keyof EventMap>(event: EventMap[K]) {
    const { type } = event;
    const payload = isUpdateEvent(event) ? event.data : event.detail;
    const message = this.#serialize(payload);

    void this.#dispatch(type, message);

    return true;
  }

  get #connection() {
    if (!this.#_connection) {
      throw new Error(
        "Unexpected state: Not connected. A connection should have " +
          "been established before attempting to use it.",
      );
    }

    return this.#_connection;
  }

  get #subscription() {
    if (!this.#_subscription) {
      throw new Error(
        "Unexpected state: Not subscribed. A subscription should " +
          "have been established before attempting to use it.",
      );
    }

    return this.#_subscription;
  }

  async #dispatch(type: string, message: Record<string, string>) {
    try {
      await this.#connection.xadd(type, "*", message);
    } catch (error) {
      Log.error(`Update dispatch failed: ${error.message}`, { error });
    }
  }

  async #listen() {
    // Iterate the subscription stream. It yields for every new message on
    // one of the subscribed channels, so we can just dispatch every message
    // we receive as an event on the target.
    for await (const { type, payload } of this.#subscription) {
      const data = this.#hydrate(payload);
      const event = type === "update"
        ? new MessageEvent(type, { data })
        : new CustomEvent(type, { detail: data });

      this.dispatchEvent(event);
    }
  }

  #hydrate({ payload }: Record<string, string>) {
    return JSON.parse(payload);
  }

  #serialize(payload: Record<string, unknown>) {
    return {
      id: typeof payload.id === "string" ? payload.id : generateId(),
      payload: JSON.stringify(payload),
    };
  }
}

class StreamSubscription {
  public readonly streams: string[];
  readonly #readTimeout: number;
  readonly #connection: Redis;
  readonly #lastIds: Record<string, "$" | `${number}-${number}`>;

  public constructor(connection: Redis, streams: string[], readTimeout = 0) {
    this.#connection = connection;
    this.#readTimeout = readTimeout;
    this.streams = streams;
    this.#lastIds = Object.fromEntries(streams.map((key) => [key, "$"]));
  }

  public close() {
    this.#connection.close();
  }

  async *messages() {
    // By running the loop until the connection is closed, we can keep
    // listening for new messages on the streams we're subscribed to.
    while (!this.#connection.isClosed) {
      const streams = await this.#connection.xread(
        this.streams.map((key) => ({
          xid: this.#lastIds[key],
          key,
        })),
        { block: this.#readTimeout },
      );

      for (const { key, messages } of streams) {
        for (const { fieldValues, xid } of messages) {
          this.#lastIds[key] = `${xid.unixMs}-${xid.seqNo}`;

          yield { type: key, payload: fieldValues };
        }
      }
    }
  }

  [Symbol.asyncIterator]() {
    return this.messages();
  }
}

function isUpdateEvent(
  event: EventMap[keyof EventMap],
): event is MessageEvent<Update> {
  return event.type === "update";
}
