import "./components/mod.js";

function log(message) {
    const log = document.querySelector("[data-log]");
    log.textContent = message + "\n" + log.textContent;
}

function onOpen(event) {
    log("Connection established: " + JSON.stringify(event));
}

function onClose(event) {
    log("Connection closed: " + JSON.stringify(event));
}

function onMessage(event) {
    log("Message received: " + JSON.stringify(event));
}

let stream;

document.addEventListener("DOMContentLoaded", main);

function main() {
    const authorizeButton = document.querySelector("[data-use-jwt-button]");
    const jwtInput = document.querySelector("[data-jwt-input]");
    jwtInput.value = localStorage.getItem("jwt") || "";

    authorizeButton.addEventListener("click", async () => {
        localStorage.setItem("jwt", jwtInput.value);
    });

    const subscribeButton = document.querySelector("[data-subscribe-button]");
    const unsubscribeButton = document.querySelector("[data-unsubscribe-button]");

    subscribeButton.addEventListener("click", async () => {
        const url = new URL("/.well-known/mercure", location.origin);
        url.searchParams.append("topic", "*");

        stream = new EventSource(url, {
            withCredentials: true,
        });
        stream.addEventListener("open", onOpen);
        stream.addEventListener("close", onClose);
        stream.addEventListener("message", onMessage);

        unsubscribeButton.disabled = false;
        subscribeButton.disabled = true;
    });

    unsubscribeButton.addEventListener("click", async () => {
        stream.close();
        stream = null;

        unsubscribeButton.disabled = true;
        subscribeButton.disabled = false;
    });
}
