import type { EventMap, MessageEventListener, Transport } from "./transports/mod.ts";

export const earliestEventId = "earliest";

export class Hub {
  readonly #transport: Transport;

  public constructor(transport: Transport) {
    this.#transport = transport;
  }

  eventsAfter(lastEventId = earliestEventId) {
    return this.#transport.eventsAfter(lastEventId);
  }

  public dispatchEvent<K extends keyof EventMap>(event: EventMap[K]) {
    this.#transport.dispatchEvent(event);
  }

  public addEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]>,
    options?: AddEventListenerOptions,
  ) {
    this.#transport.addEventListener(
      type,
      listener as EventListener,
      options,
    );

    return () =>
      this.#transport.removeEventListener(
        type,
        listener as EventListener,
      );
  }

  public removeEventListener<K extends keyof EventMap>(
    type: K,
    listener: MessageEventListener<EventMap[K]>,
  ) {
    this.#transport.removeEventListener(
      type,
      listener as EventListener,
    );
  }
}
