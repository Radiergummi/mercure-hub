type Props = Record<string, string|boolean|undefined>;

type RuntimeComponent<P extends Props> = HTMLElement & {
    props: P;
}
type ComponentInit<P extends Props> = {
    tag: `${Lowercase<string>}-${Lowercase<string>}`;
    setup: (this: RuntimeComponent<P>, shadow: ShadowRoot) => void;
    open?: boolean;
    base?: string;
    scopedStyles?: boolean;
    stylesheets?: string[];
    props?: P;
    connected?: (this: RuntimeComponent<P>, shadow: ShadowRoot) => void;
    disconnected?: (this: RuntimeComponent<P>, shadow: ShadowRoot) => void;
    adopted?: (this: RuntimeComponent<P>, shadow: ShadowRoot) => void;
    attributeChanged?: <K extends keyof P>(this: RuntimeComponent<P>, shadow: ShadowRoot, name: K, oldValue: P[K], newValue: P[K]) => void;
    observe?: (keyof P)[];
}

declare class CustomComponent extends HTMLElement implements RuntimeComponent<P> {
    props: P;

    constructor();

    static get observedAttributes(): string[];

    connectedCallback(): void;

    disconnectedCallback(): void;

    adoptedCallback(): void;

    attributeChangedCallback(name: string, oldValue: string, newValue: string): void;
}

export declare function define<P extends Props>(component: ComponentInit<P>): CustomComponent<P>;
