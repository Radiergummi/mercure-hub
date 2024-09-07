import {defineComponent} from "../../utilities.js";

export const TopicInput = defineComponent({
    tag: "topic-input",
    observe: ["disabled"],
    stylesheets: [import.meta.resolve("./style.css")],

    props: {
        placeholder: "Topic",
    },

    state: () => ({
        /**
         * @type {Map<string, HTMLElement>}
         */
        topics: new Map(),

        /**
         * @type {HTMLUListElement|null}
         */
        topicList: null,

        /**
         * @type {HTMLInputElement|null}
         */
        input: null,
    }),

    setup({shadow, state, props}) {
        if (this.attributes.getNamedItem("disabled") !== null) {
            state.topicList.classList.add("disabled");
        }

        state.topicList = this.createTopicList();
        state.input = this.createInput();

        this.addTopic("books");
        this.addTopic("https://example.com/books/42");
        this.addTopic("https://example.com/books/42/updates");
    },

    watch: {
        disabled(value) {
            this.state.input.disabled = value;
            this.state.topicList.classList.toggle("disabled", value);

            for (const topic of this.state.topics.values()) {
                topic.querySelector("button").disabled = value;
            }
        },
    },

    methods: {
        createTopicList() {
            const topicList = document.createElement("ul");
            this.shadowRoot.appendChild(topicList);

            return topicList;
        },

        createInput() {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "text";
            console.log(this.props.placeholder);
            input.placeholder = this.props.placeholder ?? "Topic";
            input.required = !!this.props.required;
            input.name = this.props.name ?? "topic";
            label.appendChild(input);
            this.shadowRoot.appendChild(label);

            input.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") {
                    return;
                }

                event.preventDefault();

                const topic = input.value.trim();

                if (this.addTopic(topic)) {
                    input.value = "";
                }
            });

            this.shadowRoot.appendChild(input);

            return input;
        },

        /**
         * Add a topic to the list.
         *
         * @param {string} topic
         * @return {boolean}
         */
        addTopic(topic) {
            if (this.state.topics.has(topic) || !topic) {
                return false;
            }

            const topicElement = document.createElement("li");
            this.state.topicList.appendChild(topicElement);
            this.state.topics.set(topic, topicElement);

            const topicText = document.createElement("span");
            topicElement.appendChild(topicText);
            topicText.textContent = topic;

            const removeButton = document.createElement("button");
            topicElement.appendChild(removeButton);
            const buttonText = document.createElement("span");
            removeButton.appendChild(buttonText);
            buttonText.textContent = "×";
            removeButton.addEventListener("click", () => {
                if (this.state.input.disabled) {
                    return;
                }

                this.removeTopic(topic);
            });

            this.emitTopics();

            return true;
        },

        /**
         * Remove a topic from the list.
         *
         * @param {string} topic
         */
        removeTopic(topic) {
            const element = this.state.topics.get(topic);
            element.remove();
            this.state.topics.delete(topic);

            this.emitTopics();
        },

        emitTopics() {
            const topics = Array.from(this.state.topics.keys());

            this.dispatchEvent(new InputEvent("change", {
                data: JSON.stringify(topics),
                bubbles: true,
            }));
        },
    },
});
