/**
 * @typedef {Object} RuntimeComponent
 *
 * @template {Record<string, string|boolean|undefined>} Props
 * @template {Record<string, any>} State
 * @template {Record<string, <A extends unknown[], R>(this: RuntimeComponent<Props, State>, ...args: A) => R>} Methods
 *
 * @property {Props} props
 * @property {State} state
 * @extends Methods
 */

/**
 * @typedef {Object} ComponentContext
 *
 * @template {Record<string, string|boolean|undefined>} Props
 * @template {Record<string, any>} State
 *
 * @property {ShadowRoot} shadow
 * @property {Props} props
 * @property {State} state
 * @property {HTMLElement["dispatchEvent"]} dispatchEvent
 */

/**
 * @typedef {Object} CustomComponent
 * @template {Record<string, string|boolean|undefined>} P
 * @template {Record<string, any>} S
 * @template {Record<string, <A extends unknown[], R>(this: RuntimeComponent<P, S>, ...args: A) => R>} M
 * @template {Record<keyof P, <T>(this: RuntimeComponent<P, S>, newValue: T, oldValue: T) => unknown>} W
 *
 * @property {string} tag
 * @property {string|undefined} [template]
 * @property {boolean|undefined} [open]
 * @property {boolean|undefined} [scopedStyles]
 * @property {string[]|undefined} [stylesheets]
 * @property {P|undefined} [props]
 * @property {(() => S)|undefined} [state]
 * @property {(this: RuntimeComponent<P, S, M>, context: ComponentContext<P, S>) => void} setup
 * @property {(this: RuntimeComponent<P, S, M>, context: ComponentContext<P, S>) => void|undefined} [connected]
 * @property {(this: RuntimeComponent<P, S, M>, context: ComponentContext<P, S>) => void|undefined} [disconnected]
 * @property {(this: RuntimeComponent<P, S, M>, context: ComponentContext<P, S>) => void|undefined} [adopted]
 * @property {(this: RuntimeComponent<P, S, M>, context: ComponentContext<P, S>, name: string, oldValue: string, newValue: string) => void|undefined} [attributeChanged]
 * @property {M} methods
 * @property {W} watch
 * @property {(keyof P)[]|undefined} [observe]
 * @property {string|undefined} [base]
 */

/**
 * @param {CustomComponent<P>} component
 * @template {Record<string, string|boolean|undefined>} P
 */
export function defineComponent(
    {
        tag,
        template = undefined,
        open = true,
        base = undefined,
        scopedStyles = false,
        stylesheets = [],
        props = {},
        connected = undefined,
        state = () => ({}),
        methods = {},
        watch = {},
        setup = () => void 0,
        disconnected = undefined,
        adopted = undefined,
        attributeChanged = undefined,
        observe = [],
    },
) {
    const mode = open ? "open" : "closed";
    const templateNode = template ? document.createElement("template") : undefined;

    if (templateNode) {
        templateNode.innerHTML = template ?? "";
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * @template P
     * @template S
     * @var {{new(): HTMLElement & RuntimeComponent<P, S>}} Component
     */
    const Component = class extends HTMLElement {
        static observedAttributes = [
            ...observe,
            ...Object.keys(watch),
        ];

        /**
         * @type {P}
         */
        props = props;

        /**
         * @type {S}
         */
        state = state();

        #proxy = new Proxy(this, {
            has(target, p) {
                return p in target || p in target.state || p in target.props;
            },
            set: (target, key, value) => {
                if (key in target) {
                    target[key] = value;
                } else if (key in target.state) {
                    target.state[key] = value;
                } else {
                    target.props[key] = value;
                }

                return true;
            },

            get: (target, key) => {
                if (key === "dispatchEvent") {
                    return target.dispatchEvent.bind(target);
                }

                if (key in target) {
                    return target[key];
                } else if (key in target.state) {
                    return target.state[key];
                } else if (key in methods) {
                    return methods[key].bind(target.#proxy);
                } else {
                    return target.props[key];
                }
            },
        });

        constructor() {
            super();
            this.attachShadow({mode});

            if (!scopedStyles) {
                addGlobalStylesToShadowRoot(this.shadowRoot);
            }

            for (const href of stylesheets) {
                addStylesheetToShadowRoot(this.shadowRoot, href);
            }

            if (templateNode) {
                this.shadowRoot.appendChild(templateNode.content.cloneNode(true));
            }
        }

        connectedCallback() {
            this.#syncProps();
            setup.call(this.#proxy, {
                shadow: this.shadowRoot,
                props: this.props,
                state: this.state,
                dispatchEvent: this.dispatchEvent.bind(this),
            });
            connected?.call(this.#proxy, {
                shadow: this.shadowRoot,
                props: this.props,
                state: this.state,
            });
        }

        disconnectedCallback() {
            disconnected?.call(this.#proxy, {
                shadow: this.shadowRoot,
                props: this.props,
                state: this.state,
            });
        }

        adoptedCallback() {
            adopted?.call(this.#proxy, {
                shadow: this.shadowRoot,
                props: this.props,
                state: this.state,
            });
        }

        attributeChangedCallback(name, oldValue, newValue) {
            this.#syncProps();
            oldValue = oldValue === "" ? true : (oldValue ?? false);
            newValue = newValue === "" ? true : (newValue ?? false);

            attributeChanged?.call(this.#proxy, {
                shadow: this.shadowRoot,
                props: this.props,
                state: this.state,
            }, name, oldValue, newValue);

            if (name in watch) {
                watch[name].call(this.#proxy, newValue, oldValue);
            }
        }

        #syncProps() {
            for (const [key, value] of Object.entries(this.props)) {
                if (value === undefined || value === null) {
                    this.removeAttribute(key);
                } else if (typeof value === "boolean") {
                    this.toggleAttribute(key, value);
                } else {
                    this.setAttribute(key, value.toString());
                }
            }
        }
    };

    globalThis.customElements.define(tag, Component, {
        extends: base,
    });

    return Component;
}

/**
 * Define a new component
 *
 * @param {CustomElementConstructor&{tag: string}} element
 * @returns {CustomElementConstructor&{tag: string}}
 */
export function registerComponent(element) {
    globalThis.customElements.define(element.tag, element);

    return element;
}

/**
 * @type {CSSStyleSheet[]|null}
 */
let globalSheets = null;

/**
 * @return {CSSStyleSheet[]}
 */
export function getGlobalStyleSheets() {
    if (globalSheets === null) {
        globalSheets = Array.from(document.styleSheets)
            .map(({cssRules}) => {
                const stylesheet = new CSSStyleSheet();
                const css = Array
                    .from(cssRules)
                    .map(({cssText}) => cssText)
                    .join(" ");
                stylesheet.replaceSync(css);

                return stylesheet;
            });
    }

    return globalSheets;
}

/**
 * Add global styles to a shadow root
 *
 * @param {ShadowRoot} shadowRoot
 */
export function addGlobalStylesToShadowRoot(shadowRoot) {
    shadowRoot.adoptedStyleSheets.push(...getGlobalStyleSheets());
}

/**
 * Add a stylesheet to a shadow root
 *
 * @param {ShadowRoot} shadowRoot
 * @param {string|URL} href Path to the stylesheet
 */
export function addStylesheetToShadowRoot(shadowRoot, href) {
    const link = document.createElement("link");
    link.href = href.toString();
    link.rel = "stylesheet";
    link.type = "text/css";

    shadowRoot.appendChild(link);
}
