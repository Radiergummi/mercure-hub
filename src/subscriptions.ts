import type { Subscriber } from "./subscribers.ts";
import type { TopicSelector } from "./topic.ts";
import { generateId, type Update } from "./updates.ts";

export class Subscription {
  readonly #target: EventTarget = new EventTarget();

  public constructor(
    public readonly subscriber: Subscriber,
    public readonly selector: TopicSelector,
    public readonly id = generateId(),
  ) {
    subscriber.subscriptions.add(this);
    subscriber.addEventListener("close", () => this.close());
  }

  public get topic() {
    return this.selector.toString();
  }

  public match(topics: readonly [string, ...string[]]) {
    return this.selector.test(...topics);
  }

  public dispatch(update: Update) {
    return this.subscriber.dispatch(update);
  }

  public close() {
    this.subscriber.subscriptions.delete(this);
    this.#target.dispatchEvent(new Event("close"));
  }

  public addEventListener<T>(
    type: "message",
    listener: (event: MessageEvent<T>) => void,
  ): void;

  public addEventListener(
    type: "close",
    listener: (event: Event) => void,
  ): void;

  public addEventListener(
    type: "message" | "close",
    listener: ((event: MessageEvent) => void) | ((event: Event) => void),
  ): void {
    this.#target.addEventListener(type, listener as EventListener);
  }

  public removeEventListener<T>(
    type: "message",
    listener: (event: MessageEvent<T>) => void,
  ): void;

  public removeEventListener(
    type: "close",
    listener: (event: Event) => void,
  ): void;

  public removeEventListener(
    type: "message" | "close",
    listener: ((event: MessageEvent) => void) | ((event: Event) => void),
  ): void {
    this.#target.removeEventListener(type, listener as EventListener);
  }
}
