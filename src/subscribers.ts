import * as Log from "@std/log";
import type {Subscription} from "./subscriptions.ts";
import type {TopicSelector} from "./topic.ts";
import {generateId, type Update} from "./updates.ts";

/**
 * Represents an individual subscriber.
 *
 * A subscriber is a client that is connected to the server and has an arbitrary
 * number of subscriptions to topics. Subscribers can be authorized to access
 * only a subset of topics, and can be associated with a payload that is sent
 * with each update.
 */
export class Subscriber {
    /**
     * The unique identifier of the subscriber.
     */
    public readonly id: string;

    /**
     * The set of subscriptions that the subscriber is currently subscribed to.
     */
    public readonly subscriptions: Set<Subscription> = new Set();

    /**
     * The topics that the subscriber is authorized to access.
     *
     * This list is read from the JWT and is thus trusted; if an update is marked
     * as private, only topics in this list will be dispatched to the subscriber.
     * If the list is empty, the subscriber will still receive public updates,
     * but not those marked as private.
     */
    public readonly authorizedTopics: TopicSelector[] = [];

    /**
     * The payload associated with the subscriber.
     *
     * This data is read from the JWT and can be used to convey user-specific
     * metadata to clients listening to subscription events.
     */
    public readonly payload: unknown;

    /**
     * Whether the subscriber is currently active.
     *
     * @private
     */
    #active: boolean;

    /**
     * The internal event target used as a message bus for the subscriber.
     *
     * @private
     */
    readonly #target: EventTarget = new EventTarget();

    /**
     * The event stream used to send events to the subscriber.
     *
     * This stream wraps the TCP connection to the client and allows pushing
     * messages to a given subscriber.
     *
     * @private
     */
    readonly #stream: EventStream;

    /**
     * The timer used to send heartbeats to the subscriber.
     *
     * If heartbeats are enabled, this timer will periodically send a heartbeat
     * message to the client to keep the connection alive.
     *
     * @private
     */
    #heartbeatTimer: number | undefined;

    /**
     * The last event ID sent to the subscriber.
     *
     * This ID is used to track the last event sent to the client, allowing the
     * client to resume the connection from the last known event.
     *
     * @private
     */
    #lastEventId: string | undefined = undefined;

    /**
     * Creates a new subscriber with the given stream and optional parameters.
     *
     * @param stream Event stream used to send events to the subscriber.
     * @param [lastEventId] Last event ID sent to the subscriber, if any.
     * @param [authorizedTopics] Optional list of topics that the subscriber is
     *                           authorized to access.
     * @param [payload] Optional payload associated with the subscriber.
     * @param [id] Unique identifier of the subscriber.
     * @param [active] Whether the subscriber is currently active.
     */
    public constructor(
        stream: EventStream,
        lastEventId?: string,
        authorizedTopics?: TopicSelector[],
        payload?: unknown,
        id: string = generateId(),
        active = true,
    ) {
        this.authorizedTopics = authorizedTopics || [];
        this.payload = payload;
        this.id = id;
        this.#stream = stream;
        this.#lastEventId = lastEventId;
        this.#active = active;
    }

    /**
     * The last event ID sent to the subscriber.
     */
    public get lastEventId() {
        return this.#lastEventId;
    }

    /**
     * Whether the subscriber is currently active.
     */
    public get active() {
        return this.#active;
    }

    /**
     * Whether the subscriber is currently authorized to access the given topics.
     *
     * @param canonicalTopic Canonical topic of the update.
     * @param alternateTopics Alternate topics of the update.
     * @param confidential Whether the update is confidential (private).
     * @param anonymousAccessEnabled Whether anonymous access is enabled on the
     *                               server.
     */
    public canAccess({
        canonicalTopic,
        alternateTopics,
        private: confidential,
    }: Update, anonymousAccessEnabled: boolean) {
        if (!anonymousAccessEnabled && !this.authorizedTopics.length) {
            return false;
        }

        for (const subscription of this.subscriptions) {
            if (!subscription.match([canonicalTopic, ...alternateTopics])) {
                continue;
            }

            if (
                !confidential ||
                this.authorizedTopics.some((selector) =>
                    selector.test(canonicalTopic, ...alternateTopics)
                )
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Closes the subscriber connection.
     *
     * This method closes the connection to the subscriber and cleans up any
     * resources associated with the subscriber. After calling this method, the
     * subscriber will no longer be able to receive updates.
     */
    public async close() {
        this.disableHeartbeats();
        this.#active = false;

        try {
            return await this.#stream.close();
        } finally {
            this.#target.dispatchEvent(new Event("close"));
        }
    }

    /**
     * Dispatches an update to the subscriber.
     *
     * @param update Update to dispatch to the subscriber.
     */
    public async dispatch(update: Update) {
        try {
            // Update the last event ID to the ID of the dispatched update.
            // We do this before writing to the stream to ensure that the last
            // event ID can be included in the response headers immediately.
            this.#lastEventId = update.id;

            await this.#stream.write(`data: ${JSON.stringify(update)}\n\n`);

            this.#target.dispatchEvent(
                new MessageEvent("message", { data: update }),
            );
        } catch (error) {
            Log.error("Error writing to stream", { error });
        }
    }

    /**
     * Enables heartbeat messages for the subscriber.
     *
     * Heartbeats are used to keep the connection alive by sending a message to
     * the client at regular intervals. If the client does not receive a
     * heartbeat message within a certain time frame, it will close the
     * connection.
     *
     * @param interval Interval between heartbeat messages in milliseconds.
     */
    public enableHeartbeats(interval = 30_000) {
        if (this.#heartbeatTimer) {
            this.disableHeartbeats();
        }

        this.#heartbeatTimer = setInterval(
            () => this.#sendHeartbeat(),
            interval,
        );
    }

    /**
     * Disables heartbeat messages for the subscriber.
     */
    disableHeartbeats() {
        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer);
        }

        this.#heartbeatTimer = undefined;
    }

    /**
     * Adds an event listener to the subscriber.
     *
     * @param type
     * @param listener
     * @see EventTarget.addEventListener
     */
    public addEventListener<T extends keyof EventMap>(
        type: T,
        listener: (event: EventMap[T]) => void,
    ): void {
        this.#target.addEventListener(type, listener as EventListener);
    }

    /**
     * Removes an event listener from the subscriber.
     *
     * @param type
     * @param listener
     * @see EventTarget.removeEventListener
     */
    public removeEventListener<T extends keyof EventMap>(
        type: T,
        listener: (event: EventMap[T]) => void,
    ): void {
        this.#target.removeEventListener(type, listener as EventListener);
    }

    /**
     * Serializes the subscriber to a JSON object.
     *
     * This is mainly useful for debugging and logging purposes.
     *
     * @internal
     */
    public toJSON() {
        return {
            id: this.id,
            active: this.#active,
            lastEventId: this.#lastEventId,
            payload: this.payload,
            topics: Array
                .from(this.subscriptions)
                .map(({ selector }) => selector),
        };
    }

    /**
     * Returns a string representation of the subscriber.
     *
     * @internal
     */
    public [Symbol.for("Deno.customInspect")]() {
        return JSON.stringify(this, null, 4);
    }

    /**
     * Sends a heartbeat message to the subscriber.
     *
     * @private
     */
    async #sendHeartbeat() {
        if (!this.#heartbeatTimer) {
            return;
        }

        if (this.#stream) {
            await this.#stream.write(":💓\n\n");
            this.#target.dispatchEvent(new Event("heartbeat"));
        }
    }
}

type EventMap = {
    message: MessageEvent<Update>;
    heartbeat: Event;
    close: Event;
};

export class EventStream {
    readonly #encoder = new TextEncoder();
    readonly #stream: WritableStreamDefaultWriter<Uint8Array>;

    public constructor(stream: WritableStream<Uint8Array>) {
        this.#stream = stream.getWriter();
    }

    public close() {
        return this.#stream.close();
    }

    public async write(input: Uint8Array | string) {
        try {
            if (typeof input === "string") {
                input = this.#encoder.encode(input);
            }

            await this.#stream.write(input);
        } catch {
            Log.error("Error writing to stream");
        }

        return this;
    }
}
