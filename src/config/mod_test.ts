import { assertEquals, assertRejects } from "@std/assert";
import { mockCwd, mockEnv, mockFs, mockReadTextFile } from "../test_utilities.ts";
import { loadConfigurationFromFile } from "./_file.ts";
import { type Configuration, loadConfiguration } from "./mod.ts";

Deno.test("loadConfiguration", async (ctx) => {
  await ctx.step("Load from specific file", async () => {
    mockFs({
      "/etc/mercure/config.json": JSON.stringify({ transportUri: "redis://redis:6379" }),
    });

    const config = await loadConfiguration(Deno.env, "/etc/mercure/config.json");
    assertEquals(config.transportUri, "redis://redis:6379");
  });

  await ctx.step("Load from environment variables", async () => {
    Deno.env.set("MERCURE_TRANSPORT_URI", "redis://redis:6379");

    const config = await loadConfiguration(Deno.env);
    assertEquals(config.transportUri, "redis://redis:6379");

    Deno.env.delete("MERCURE_TRANSPORT_URI");
  });

  await ctx.step("Load from environment variables with file references", async () => {
    mockFs({
      "/etc/mercure/secret.txt": "redis://redis:6379",
    });
    Deno.env.set("MERCURE_TRANSPORT_URI_FILE", "/etc/mercure/secret.txt");

    const config = await loadConfiguration(Deno.env);
    assertEquals(config.transportUri, "redis://redis:6379");

    Deno.env.delete("MERCURE_TRANSPORT_URI_FILE");
  });

  await ctx.step("Load with override arguments", async () => {
    const config = await loadConfiguration(Deno.env, undefined, {
      transportUri: "redis://redis:6379",
    });
    assertEquals(config.transportUri, "redis://redis:6379");
  });

  await ctx.step("Handle missing configuration file", async () => {
    mockFs(() => Promise.reject(new Deno.errors.NotFound("File not found")));

    const config = await loadConfiguration(Deno.env, "/etc/mercure/config.json");
    assertEquals(config, {} as Partial<Configuration>);
  });

  await ctx.step("Handle permission denied error", async () => {
    mockFs((_path) => Promise.reject(new Deno.errors.PermissionDenied("Permission denied")));

    const config = await loadConfiguration(Deno.env, "/etc/mercure/config.json");
    assertEquals(config, {} as Partial<Configuration>);
  });

  await ctx.step("Handle unknown error", async () => {
    mockFs((_path) => Promise.reject(new Error("Unknown error")));

    await assertRejects(
      async () => {
        await loadConfiguration(Deno.env, "/etc/mercure/config.json");
      },
      Error,
      'Failed to load configuration file "/etc/mercure/config.json": Failed to read file: Unknown error',
    );
  });
});

function mockConfigLoader(
  mockFiles: Record<string, string> | ((path: string) => Promise<string>),
  callback?: () => void,
) {
  return mockEnv({ XDG_CONFIG_HOME: "/home/example/.config" }, async () => {
    await mockCwd("/opt/example", async () => {
      await mockReadTextFile(
        mockFiles,
        () => {
          return assertRejects(
            async () => {
              await loadConfigurationFromFile();
            },
          );
        },
      );
    });
  });
}
