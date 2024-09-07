import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import { mockCwd, mockEnv, mockFs, mockReadTextFile } from "../test_utilities.ts";
import { loadConfigurationFromFile, resolveConfigFileVariant } from "./_file.ts";
import type { ConfigurationInput } from "./_schema.ts";

Deno.test("Configuration file loading", async (ctx) => {
  await ctx.step("Resolve file variant from filename", async (ctx) => {
    await ctx.step("JSON file", () => {
      const variant = resolveConfigFileVariant("config.json");
      assertEquals(variant.type, "json");
      assertEquals(variant.filename, "config.json");
    });
    await ctx.step("YAML file", () => {
      const variant = resolveConfigFileVariant("config.yaml");
      assertEquals(variant.type, "yaml");
      assertEquals(variant.filename, "config.yaml");
      const variantShort = resolveConfigFileVariant("config.yml");
      assertEquals(variantShort.type, "yaml");
      assertEquals(variantShort.filename, "config.yml");
    });
    await ctx.step("TOML file", () => {
      const variant = resolveConfigFileVariant("config.toml");
      assertEquals(variant.type, "toml");
      assertEquals(variant.filename, "config.toml");
    });
    await ctx.step("Module file", () => {
      const typescriptVariant = resolveConfigFileVariant("module.config.ts");
      assertEquals(typescriptVariant.type, "module");
      assertEquals(typescriptVariant.filename, "module.config.ts");

      const javascriptVariant = resolveConfigFileVariant("module.config.js");
      assertEquals(javascriptVariant.type, "module");
      assertEquals(javascriptVariant.filename, "module.config.js");
    });
    await ctx.step("Bails for unknown file types", () => {
      assertThrows(() => resolveConfigFileVariant("config.unknown"));
    });
  });

  await ctx.step("Load configuration", async (ctx) => {
    await ctx.step("Specific file: JSON file", async () => {
      mockFs({
        "/etc/mercure/config.json": JSON.stringify({ transportUri: "redis://redis:6379" }),
      });

      const config = await loadConfigurationFromFile({
        type: "json",
        filename: "/etc/mercure/config.json",
        parse: async (filename: string) =>
          JSON.parse(await Deno.readTextFile(filename)) as Partial<
            ConfigurationInput
          >,
      });
      assertEquals(config.transportUri, "redis://redis:6379");
    });

    await ctx.step("Specific file: YAML file", async () => {
      mockFs({
        "/etc/mercure/config.yaml": "transportUri: redis://redis:6379",
      });

      const config = await loadConfigurationFromFile({
        type: "yaml",
        filename: "/etc/mercure/config.yaml",
        parse: async (filename: string) =>
          parseYaml(await Deno.readTextFile(filename)) as Partial<ConfigurationInput>,
      });
      assertEquals(config.transportUri, "redis://redis:6379");
    });

    await ctx.step("Specific file: TOML file", async () => {
      mockFs({
        "/etc/mercure/config.toml": 'transportUri = "redis://redis:6379"',
      });

      const config = await loadConfigurationFromFile({
        type: "toml",
        filename: "/etc/mercure/config.toml",
        parse: async (filename: string) =>
          parseToml(await Deno.readTextFile(filename)) as Partial<ConfigurationInput>,
      });
      assertEquals(config.transportUri, "redis://redis:6379");
    });

    await ctx.step("Specific file: File not found", () => {
      mockFs(() => Promise.reject(new Deno.errors.NotFound("File not found")));

      assertRejects(async () => {
        await loadConfigurationFromFile({
          type: "json",
          filename: "/etc/mercure/config.json",
          parse: async (filename: string) =>
            JSON.parse(await Deno.readTextFile(filename)) as Partial<
              ConfigurationInput
            >,
        });
      });
    });

    await ctx.step("Specific file: Permission denied", () => {
      mockFs((_path) => Promise.reject(new Deno.errors.PermissionDenied("Permission denied")));

      assertRejects(async () => {
        await loadConfigurationFromFile({
          type: "json",
          filename: "/etc/mercure/config.json",
          parse: async (filename: string) =>
            JSON.parse(await Deno.readTextFile(filename)) as Partial<
              ConfigurationInput
            >,
        });
      });
    });

    await ctx.step("Specific file: Unknown error", () => {
      mockFs((_path) => Promise.reject(new Error("Unknown error")));

      assertRejects(
        async () => {
          await loadConfigurationFromFile({
            type: "json",
            filename: "/etc/mercure/config.json",
            parse: async (filename: string) =>
              JSON.parse(await Deno.readTextFile(filename)) as Partial<
                ConfigurationInput
              >,
          });
        },
        Error,
        'Failed to load configuration file "/etc/mercure/config.json": Unknown error',
      );
    });

    await ctx.step("Unspecific file: File not found", async () => {
      await mockEnv({ XDG_CONFIG_HOME: "/home/example/.config" }, async () => {
        await mockCwd("/etc/mercure", async () => {
          await mockReadTextFile(
            () => Promise.reject(new Deno.errors.NotFound("File not found")),
            async () => {
              const config = await loadConfigurationFromFile();
              assertEquals(config, {} as Partial<ConfigurationInput>);
            },
          );
        });
      });
    });

    await ctx.step("Unspecific file: Permission denied", async () => {
      await mockEnv({ XDG_CONFIG_HOME: "/home/example/.config" }, async () => {
        await mockCwd("/etc/mercure", async () => {
          await mockReadTextFile(
            () => Promise.reject(new Deno.errors.PermissionDenied("Permission denied")),
            async () => {
              const config = await loadConfigurationFromFile();
              assertEquals(config, {} as Partial<ConfigurationInput>);
            },
          );
        });
      });
    });

    await ctx.step("Unspecific file: Unknown error", async () => {
      await mockEnv({ XDG_CONFIG_HOME: "/home/example/.config" }, async () => {
        await mockCwd("/etc/mercure", async () => {
          await mockReadTextFile(
            () => Promise.reject(new Error("Unknown error")),
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
    });
  });
});
