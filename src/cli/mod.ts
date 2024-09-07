import { Command, EnumType } from "@cliffy/command";
import { LogLevelNames } from "@std/log";
import { Issue } from "./commands/issue.ts";
import { Serve } from "./commands/serve.ts";

const commands = [
  Serve,
  Issue,
] as const;

export async function cli(argv: string[]): Promise<void> {
  const cli = new Command()
    .name("mercure")
    .version("0.0.1")
    .meta("deno", Deno.version.deno)
    .meta("v8", Deno.version.v8)
    .meta("typescript", Deno.version.typescript)
    .help({ hints: false })
    .description("Mercure Hub")
    .type("log-level", logLevelType, { global: true })
    .type("log-format", logFormats, { global: true })
    .option(
      "--log-level <level:log-level>",
      `The minimum log level to use for runtime logging. ` +
        `Defaults to "info".`,
      { global: true },
    )
    .option(
      "--log-format <format:log-format>",
      `The format to use for runtime logging. If auto, it will use ` +
        `JSON in non-interactive environments automatically. ` +
        `Defaults to "auto".`,
      { global: true },
    )
    .option(
      "--log-colors",
      `Enable colored log output. If "auto", it will use colors in ` +
        `interactive environments. Defaults to "auto".`,
      { global: true },
    )
    .option(
      "--no-log-colors",
      "Disable colored log output.",
      { global: true, hidden: true },
    )
    .action(function () {
      return this.showHelp();
    });

  for (const command of commands) {
    cli.command(command.getName(), command);
  }

  try {
    await cli.parse(argv);
  } catch (cause) {
    console.error(cause.message);
    Deno.exit(1);
  }
}

const logLevelType = new EnumType(
  LogLevelNames.slice(1).map((l) => l.toLowerCase()),
);
const logFormats = new EnumType(["json", "console", "auto"] as const);
