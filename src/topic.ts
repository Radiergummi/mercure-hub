import {urlPatternToString} from "./server/utils.ts";
import {convertToUrlPattern} from "./uri_template.ts";

/**
 * Creates a new topic selector from the given topic string.
 *
 * @param topic Topic to create a selector for.
 * @param baseURL Base URL to use for relative URL patterns. Required if the
 *                topic is a relative URL pattern.
 */
export function createTopicSelector(
    topic: string,
    baseURL?: URL,
): TopicSelector {
    if (topic === "*") {
        return new TopicSelector(Wildcard, baseURL);
    }

    if (topic.includes("{")) {
        return new TopicSelector(
            convertToUrlPattern(topic, baseURL),
            baseURL,
        );
    }

    return new TopicSelector(topic, baseURL);
}

type Selector = string | URLPattern | typeof Wildcard;

/**
 * Represents a topic selector.
 *
 * A topic selector is used to match topics in a subscription against a set of
 * topics patterns. It can be a literal string, a URL pattern, or a wildcard;
 * by pre-compiling the selector, we avoid having to parse the topic every time
 * we need to match it against a set of topics.
 */
export class TopicSelector<T extends Selector = Selector> {
    public constructor(
        public readonly selector: T,
        public readonly baseURL: URL | undefined,
    ) {
    }

    /**
     * The type of the selector.
     */
    public get type() {
        if (this.selector === Wildcard) {
            return "wildcard";
        }

        if (typeof this.selector === "string") {
            return "literal";
        }

        return "template";
    }

    /**
     * Tests whether the selector matches at least one of the given topics.
     *
     * @param topics Topics to test against the selector.
     */
    test(...topics: string[]) {
        return topics.some((topic) => {
            if (this.selector === Wildcard) {
                return true;
            }

            if (typeof this.selector === "string") {
                return this.selector === topic;
            }

            return !!this.selector.test(topic, this.baseURL?.toString());
        });
    }

    /**
     * Returns a string representation of the selector.
     */
    public toString() {
        if (this.selector === Wildcard) {
            return "*";
        }

        if (typeof this.selector === "string") {
            return this.selector;
        }

        return urlPatternToString(this.selector);
    }

    /**
     * Returns a JSON representation of the selector.
     *
     * This is mainly useful for debugging and logging purposes.
     *
     * @internal
     */
    toJSON() {
        return { type: this.type, selector: this.selector };
    }

    /**
     * Returns a string representation of the selector.
     *
     * @internal
     */
    [Symbol.for("Deno.customInspect")]() {
        return `<<TopicSelector(selector: "${this.toString()}", type: ${this.type})>>`;
    }
}

/**
 * Wildcard symbol used to represent a wildcard topic selector.
 */
export const Wildcard = Symbol("*");
