import {defineComponent} from "../../utilities.js";

export const TokenForm = defineComponent({
    tag: "token-form",

    stylesheets: [import.meta.resolve("./style.css")],

    props: {
        method: "post",
        action: "/token",
    },

    state: () => ({
        /**
         * @type {HTMLFormElement|null}
         */
        form: null,
    }),

    setup() {
        this.form = document.createElement("form");
        this.shadowRoot.appendChild(this.form);
        this.form.method = this.method;
        this.form.action = this.action;

        this.addTopicScopePanel("subscribe", "Subscribe");
        this.addTopicScopePanel("publish", "Publish");

        const submitButton = document.createElement("button");
        this.form.appendChild(submitButton);
        submitButton.style.gridColumn = "span 2";
        submitButton.type = "submit";
        submitButton.textContent = "Generate token";
        },

    methods: {

        /**
         * @param {string} scope
         * @param {string} title
         */
        addTopicScopePanel(scope, title) {
            const container = document.createElement("div");
            this.form.appendChild(container);

            const enableScope = document.createElement("label");
            container.appendChild(enableScope);

            const input = document.createElement("input");
            enableScope.appendChild(input);
            input.type = "checkbox";
            input.name = scope;
            input.value = "1";
            input.checked = true;

            const label = document.createElement("span");
            label.textContent = scope;
            enableScope.appendChild(label);

            const topicInput = document.createElement("topic-input");
            topicInput.setAttribute("name", `${title}.topic`);
            container.appendChild(topicInput);

            input.addEventListener("change", () => {
                input.checked
                    ? topicInput.removeAttribute("disabled")
                    : topicInput.setAttribute("disabled", "");
            });

            topicInput.addEventListener("change", (event) => {
                console.log(JSON.parse(event.data));
            });
        },
    },
});
