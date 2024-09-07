import { earliestEventId } from "../hub.ts";
import type { Update } from "../updates.ts";
import type { EventMap, MessageEventListener, Transport } from "./mod.ts";

/**
 * A transport type that stores updates in memory.
 *
 * This transport is useful for testing and development purposes, as it does not
 * persist any data. It is also limited to a single instance, so it is not
 * suitable for production use.
 */
export class MemoryTransport implements Transport {
  public readonly protocol = "memory:";

  readonly #target = new EventTarget();
  readonly #store = new RingBuffer<Update>();

  /**
   * Create a new memory transport.
   *
   * @param limit The maximum number of updates to store
   */
  constructor(public readonly limit?: number) {
    if (limit) {
      this.#store.limit = limit;
    }
  }

  public async *eventsAfter(lastEventId = earliestEventId) {
    let next = lastEventId === earliestEventId;

    for (const update of this.#store) {
      if (next) {
        yield update;
      }

      if (update.id === lastEventId) {
        next = true;
      }
    }
  }

  public connect(_uri: URL, _enableSubscriptionEvents: boolean) {}

  public close() {}

  public addEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]> | null,
    options?: AddEventListenerOptions,
  ) {
    this.#target.addEventListener(type, listener as EventListener, options);
  }

  public removeEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]> | null,
  ) {
    this.#target.removeEventListener(type, listener as EventListener);
  }

  public dispatchEvent<K extends keyof EventMap>(event: EventMap[K]) {
    if (event.type === "update") {
      const update = (event as MessageEvent<Update>).data;

      this.#store.push(update);
    }

    this.#target.dispatchEvent(event);

    return true;
  }
}

/**
 * A ring buffer that stores a fixed number of items.
 *
 * When the buffer is full, new items will replace the oldest items.
 */
class RingBuffer<T> {
  #buffer: T[] = [];
  #limit: number;
  #pointer = 0;

  constructor(limit = Infinity) {
    this.#limit = limit;
  }

  get length() {
    return this.#buffer.length;
  }

  get limit() {
    return this.#limit;
  }

  set limit(limit) {
    this.#limit = limit;

    if (limit === 0) {
      this.clear();
    } else if (limit !== this.limit) {
      this.#buffer = [...this.#buffer].slice(-limit);
      this.#pointer = this.#buffer.length;
    }

    this.#limit = limit;
  }

  push(value: T) {
    if (this.#buffer.length === this.#limit) {
      this.#buffer[this.#pointer] = value;
    } else {
      this.#buffer.push(value);
    }

    this.#pointer = (this.#pointer + 1) % this.#limit;

    return this;
  }

  clear() {
    this.#buffer = [];
    this.#pointer = 0;
  }

  *[Symbol.iterator]() {
    yield* this.#buffer;
  }
}
