import type { FormatterFunction } from "@std/log";
import * as Log from "@std/log";
import type { Configuration } from "./config/mod.ts";

type LoggingOptions = Partial<Pick<Configuration, "logLevel" | "logFormat" | "logColors">>;

export function configureLogging({
  logLevel: level = "WARN",
  logFormat: format = "auto",
  logColors: useColors = "auto",
}: LoggingOptions = {}) {
  const terminal = Deno.stdin.isTerminal();
  const handler = new Log.ConsoleHandler(level, {
    formatter: (format === "auto" && terminal) || format === "console"
      ? consoleFormatter
      : Log.formatters.jsonFormatter,
    useColors: useColors === "auto" ? terminal : useColors,
  });

  Log.setup({
    handlers: { console: handler },
    loggers: {
      default: {
        handlers: ["console"],
        level,
      },
    },
  });

  // Override the global console object to use the logger instead
  globalThis.console = {
    ...globalThis.console,
    debug: Log.debug.bind(Log),
    info: Log.info.bind(Log),
    warn: Log.warn.bind(Log),
    error: Log.error.bind(Log),
  };
}

/**
 * Custom formatter for console logs
 *
 * This formatter renders log records in a human-readable format
 */
const consoleFormatter = function consoleFormatter({
  datetime,
  loggerName,
  levelName,
  msg: message,
}) {
  const timestamp = datetime.toLocaleTimeString("en-UK", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return `${timestamp} [${loggerName}]\t${levelName}\t${message}`;
} satisfies FormatterFunction;
