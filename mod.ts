import {cli} from "./src/cli/mod.ts";

export { cli };
export { server } from "./src/server/mod.ts";
export { type Configuration, loadConfiguration } from "./src/config/mod.ts";

if (import.meta.main) {
  await cli(Deno.args);
}
