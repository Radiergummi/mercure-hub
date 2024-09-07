import { Command } from "@cliffy/command";
import { blue, magenta, red, yellow } from "@std/fmt/colors";
import * as Log from "@std/log";
import type { ZodFormattedError } from "zod";
import { ZodError } from "zod";
import type { ConfigurationInput } from "../../config/mod.ts";
import { loadConfiguration } from "../../config/mod.ts";
import { server as runServer } from "../../server/mod.ts";
import { InvocationError, ParseError } from "../_errors.ts";
import { resolveFileOption } from "../_utilities.ts";

const signal = configureSignals();

export const Serve = new Command()
  .name("serve")
  .description("Start the Mercure server.")
  .option("--debug", "Enable debug mode. Intended for development only.", {
    hidden: true,
  })
  .option("-c, --config-file <file:file>", "Load configuration from a file")
  .option(
    "-t, --transport-uri <uri:string>",
    "The connection DSN to use for the event transport. The URL scheme " +
      "will be used to identify the transport adapter to use.",
  )
  .option(
    "--heartbeat-interval <duration:integer>",
    "The interval between heartbeat messages, in milliseconds. " +
      "Defaults to 30 seconds.",
  )
  .group("Server Options")
  .option(
    "-l, --listen-address <adress:string>",
    `Address to listen on, as ${blue(placeholder("host") + ":" + placeholder("port"))} ` +
      `or ${blue("unix://" + placeholder("socket-path"))}. Defaults to localhost:8000.`,
    {
      value: (value?: string) => {
        if (!value) {
          return;
        }

        if (value.startsWith("unix://")) {
          return value;
        }

        return "tcp://" + value.replace(/^.+:\/\//, "");
      },
    },
  )
  .option(
    "--observability-listen-address <adress:string>",
    "Optional separate listen address for the observability endpoints, " +
      `as ${blue(placeholder("host") + ":" + placeholder("port"))} ` +
      `or ${blue("unix://" + placeholder("socket-path"))}.`,
    {
      value: (value?: string) => {
        if (!value) {
          return;
        }

        if (value.startsWith("unix://")) {
          return value;
        }

        return "tcp://" + value.replace(/^.+:\/\//, "");
      },
    },
  )
  .option(
    "--health-check",
    "Enable the health check endpoint.",
  )
  .option(
    "--no-health-check",
    "Disable the health check endpoint.",
    { hidden: true },
  )
  .option(
    "-m, --metrics",
    "Enable the Prometheus metrics collector.",
  )
  .option(
    "--no-metrics",
    "Disable the Prometheus metrics collector.",
    { hidden: true },
  )
  .option(
    "--metrics-endpoint <path:string>",
    "Path to publish the Prometheus metrics endpoint at.",
    { default: "/metrics", depends: ["metrics"] },
  )
  .option(
    "--web-ui",
    "Enable the web-based user interface.",
  )
  .option("-a, --subscriptions-api", "Enable the subscriptions API.")
  .option(
    "--no-subscriptions-api",
    "Disable the subscriptions API.",
    { hidden: true },
  )
  .group("Authorization Options")
  .option(
    "--query-param-authorization",
    "Enable subscribers to authenticate using a query parameter. This " +
      "method is not recommended due to its security deficiencies.",
  )
  .option(
    "-A, --anonymous-access",
    "Enable subscribers without a valid token to connect to the server.",
  )
  .option(
    "--cookie-name <name:string>",
    "Name of the cookie used to store the authorization token.",
  )
  .option(
    "-o, --allowed-origins <origin>",
    "A list of allowed origins for publishing and subscribing. Can be " +
      "specified multiple times. Use * to allow all origins.",
    { collect: true },
  )
  .group("JWK Options")
  .option(
    "-j, --jwk <jwk:file>",
    `JWK to use for verifying both publisher and subscriber JWTs. Pass ` +
      `the special value ${blue("-")} to read from stdin, a file path ` +
      `to read from a file, or the plain JWK string.`,
    {
      conflicts: [
        "publish-jwk",
        "subscribe-jwk",
        "jwks-url",
        "publish-jwks-url",
        "subscribe-jwks-url",
      ],
      value: resolveFileOption,
    },
  )
  .option("--publish-jwk <jwk>", "JWK to use for verifying publisher JWTs.", {
    conflicts: [
      "jwk",
      "jwks-url",
      "publish-jwks-url",
      "subscribe-jwks-url",
    ],
    depends: ["subscribe-jwk"],
  })
  .option("--subscribe-jwk <jwk>", "JWK to use for verifying subscriber JWTs.", {
    conflicts: [
      "jwk",
      "jwks-url",
      "publish-jwks-url",
      "subscribe-jwks-url",
    ],
    depends: ["publish-jwk"],
  })
  .option(
    "-J, --jwks-url <url>",
    "URL of the JSON Web Key Set (JWK Set) to use for verifying both " +
      "publisher JWTs and subscriber JWTs.",
    {
      conflicts: [
        "jwk",
        "publish-jwk",
        "subscribe-jwk",
        "publish-jwks-url",
        "subscribe-jwks-url",
      ],
    },
  )
  .option(
    "--publish-jwks-url <url>",
    "URL of the JSON Web Key Set (JWK Set) to use for validating publisher JWTs.",
    {
      conflicts: [
        "jwk",
        "publish-jwk",
        "subscribe-jwk",
        "jwks-url",
      ],
      depends: ["subscribe-jwks-url"],
    },
  )
  .option(
    "--subscribe-jwks-url <url>",
    "URL of the JSON Web Key Set (JWK Set) to use for validating subscriber JWTs.",
    {
      conflicts: [
        "jwk",
        "publish-jwk",
        "subscribe-jwk",
        "jwks-url",
      ],
      depends: ["publish-jwks-url"],
    },
  )
  .action(async (options) => {
    let config: Awaited<ReturnType<typeof loadConfiguration>>;

    try {
      config = await loadConfiguration(
        Deno.env,
        options.configFile,
        // TODO: This type error is related to the fact that Cliffy does
        //       not report conflict options as mutually exclusive. This
        //       still results in a valid configuration object, though.
        //       Maybe this could be fixed by some arcane type magic?
        options as Partial<ConfigurationInput>,
      );
    } catch (cause) {
      if (options.debug) {
        console.error(red("%o\n"), cause);

        throw new Error("Terminated prematurely due to an error.");
      }

      if (cause instanceof ZodError) {
        const message = renderConfigurationValidationError(cause);

        throw new ParseError(message, cause);
      }

      throw new ParseError(
        `Configuration could not be loaded: ${cause.message}`,
        cause,
      );
    }

    try {
      const server = await runServer(config, signal);
      await server.finished;
    } catch (cause) {
      if (options.debug) {
        console.error(red("%o\n"), cause);

        throw new Error("Terminated due to an error.");
      }

      throw new InvocationError(cause.message, 1, cause);
    }

    Deno.exit(0);
  });

function renderConfigurationValidationError<
  T extends ZodError<ConfigurationInput>,
>(
  cause: T,
) {
  const errors = cause.format();
  const generalErrors = errors._errors ?? [];
  const fieldErrors = Object
    .entries(errors)
    .filter(<K extends Exclude<keyof ZodFormattedError<T>, "_errors">>(
      entry: [string | number | symbol, unknown],
    ): entry is [K, ZodFormattedError<T>[K]] => entry[0] !== "_errors")
    .map(([option, fieldErrors], _index, all) => {
      let fieldBuffer = `In option ${red(option)}: `;
      const many = all.length > 1;

      fieldErrors._errors?.length === 1
        ? fieldBuffer += fieldErrors._errors[0]
        : fieldErrors._errors.forEach((message: string) => (
          fieldBuffer += "\n" + " ".repeat(many ? 3 : 1) + ` ◦ ${message}`
        ));

      return fieldBuffer;
    });

  let buffer = Object.keys(errors).length > 2
    ? "The provided configuration is invalid. The following issues occurred:\n"
    : "The provided configuration is invalid. ";

  if (generalErrors.length) {
    buffer += generalErrors.join("\n ◦ ");
  }

  if (fieldErrors.length) {
    buffer += generalErrors.length ? "\n\n" : "";

    if (fieldErrors.length > 1) {
      buffer += " ◦ ";
    }

    buffer += fieldErrors.join("\n ◦ ");
  }

  return buffer;
}

/**
 * Configure the signal handling for the command.
 *
 * This will register a signal listener for SIGINT and SIGTERM, and return an
 * AbortSignal that will be triggered when either of these signals is received.
 *
 * This way, if the command is aborted gracefully (or forcefully!), we can
 * propagate the shutdown request to the server and clean up resources.
 */
function configureSignals() {
  const controller = new AbortController();
  controller.signal.addEventListener("abort", ({ target }) => {
    const { reason = "Unknown", code = 1 } = target instanceof AbortSignal &&
        resolveAbortReason(target.reason)
      ? target.reason
      : {};

    Log.debug("Received signal to abort: %s", reason);

    setTimeout(() => Deno.exit(code), 3_000);
  });

  Deno.addSignalListener("SIGINT", () => {
    controller.abort({ reason: "Interrupted", code: 130 } satisfies AbortReason);
  });
  Deno.addSignalListener("SIGTERM", () => {
    controller.abort({ reason: "Terminated", code: 143 } satisfies AbortReason);
  });

  return controller.signal;
}

function resolveAbortReason(reason: unknown): reason is AbortReason {
  return typeof reason === "object" && reason !== null && "reason" in reason;
}

type AbortReason = { reason: string; code?: number };

function placeholder(value: string) {
  return yellow("<") + magenta(value) + yellow(">");
}
