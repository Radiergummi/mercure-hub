import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import type { MaybePromise } from "../server/utils.ts";
import type { ConfigurationInput } from "./_schema.ts";
import { extname, resolve } from "@std/path";

/**
 * Default configuration base filename.
 *
 * This is the default base filename used to generate configuration file
 * variants if no specific filename is provided.
 */
const defaultConfigFilename = "mercure";

/**
 * Resolve the configuration file variants for the given filename.
 *
 * @param filename The filename to resolve the configuration file variants for
 * @returns A list of configuration file variants
 */
export function resolveConfigFileVariant(
  filename: string,
): ConfigFileVariant {
  const extension = extname(filename);

  switch (extension) {
    case ".ts":
    case ".js":
      return { type: "module", filename, parse: parseModuleConfig };

    case ".json":
      return { type: "json", filename, parse: parseJsonConfig };

    case ".toml":
      return { type: "toml", filename, parse: parseTomlConfig };

    case ".yaml":
    case ".yml":
      return { type: "yaml", filename, parse: parseYamlConfig };

    default:
      throw new Error(
        `Unsupported configuration file format: ${extension}`,
      );
  }
}

/**
 * Load the configuration from the provided file.
 *
 * This function will try to load the configuration from the provided file. If
 * the file does not exist or cannot be read, the function will proceed to the
 * next file variant. If no file can be read, an empty object will be returned.
 *
 * @param variant A specific configuration file variant to load. If not provided
 *                or empty, the function will generate a list of possible
 *                configuration file variants for the default filename.
 * @returns The loaded configuration object
 */
export async function loadConfigurationFromFile(
  variant?: ConfigFileVariant,
): Promise<Partial<ConfigurationInput>> {
  const variants = !variant ? generateConfigFileVariants(defaultConfigFilename) : [variant];

  for (const { filename, parse } of variants) {
    try {
      return await parse(filename);
    } catch (cause) {
      if (
        !variant && (
          cause instanceof Deno.errors.NotFound ||
          cause instanceof Deno.errors.PermissionDenied ||
          cause.code === "ERR_MODULE_NOT_FOUND"
        )
      ) {
        continue;
      }

      throw new Error(
        `(${cause.constructor.code}) Failed to load configuration file "${filename}": ${cause.message}`,
        { cause },
      );
    }
  }

  return {};
}

/**
 * Generate a list of possible configuration file variants.
 *
 * This function will generate a list of possible configuration file variants in
 * the order of precedence. The order is as follows:
 *
 *  1. The current working directory
 *  2. The current working directory with `.config/` appended
 *  3. The XDG configuration home (usually `~/.config`) with `mercure/` appended
 *  3. The XDG configuration home
 *  4. The user's home directory with `.config/mercure/` appended
 *  5. The user's home directory with `mercure/` appended
 *  6. The system-wide configuration directory (hard-wired to `/etc/mercure`)
 *
 * For every directory, the function will
 * {@link generateConfigFileVariant generate several file variants} and return
 * all of them as a flat list.
 *
 * @param filename The base filename to use
 * @returns A flat list of possible configuration file variants
 *
 * @see generateConfigFileVariant
 */
function generateConfigFileVariants(filename: string) {
  const directories = [
    Deno.cwd(),
    resolve(Deno.cwd(), ".config"),
  ];

  if (Deno.env.has("XDG_CONFIG_HOME")) {
    const directory = Deno.env.get("XDG_CONFIG_HOME")!;
    directories.push(resolve(directory, "mercure"));
    directories.push(directory);
  }

  if (Deno.env.has("HOME")) {
    const directory = Deno.env.get("HOME")!;
    directories.push(resolve(directory, ".config", "mercure"));
    directories.push(resolve(directory, "mercure"));
  }

  directories.push("/etc/mercure");

  return directories.flatMap((directory) =>
    generateConfigFileVariant(resolve(directory, filename))
  );
}

/**
 * Generate a list of possible configuration file variants.
 *
 * This function will generate a list of possible configuration file variants in
 * the order of precedence. The order is as follows:
 *
 *  1. TypeScript module: `<filename>.config.ts`
 *  2. JavaScript module: `<filename>.config.js`
 *  3. TOML file: `<filename>.toml`
 *  4. JSON file: `<filename>.json`
 *  5. YAML file: `<filename>.yaml`
 *  6. YAML file with short extension: `<filename>.yml`
 *
 * @param basePath The base path to generate the variants for
 * @returns A list of possible configuration file variants
 */
function generateConfigFileVariant(basePath: string): ConfigFileVariant[] {
  return [
    {
      type: "module",
      filename: `${basePath}.config.ts`,
      parse: parseModuleConfig,
    },
    {
      type: "module",
      filename: `${basePath}.config.js`,
      parse: parseModuleConfig,
    },
    {
      type: "toml",
      filename: `${basePath}.toml`,
      parse: parseTomlConfig,
    },
    {
      type: "json",
      filename: `${basePath}.json`,
      parse: parseJsonConfig,
    },
    {
      type: "yaml",
      filename: `${basePath}.yaml`,
      parse: parseYamlConfig,
    },
    {
      type: "yaml",
      filename: `${basePath}.yml`,
      parse: parseYamlConfig,
    },
  ];
}

/**
 * A configuration file variant.
 *
 * This type represents a single configuration file variant, which consists of
 * the file type, the filename, and a function to parse the file content.
 */
type ConfigFileVariant = {
  type: "module" | "json" | "toml" | "yaml";
  filename: string;
  parse: (filename: string) => MaybePromise<Partial<ConfigurationInput>>;
};

/**
 * Read a configuration file.
 *
 * This function will read the content of the provided file and return it as a
 * string. If the file does not exist or cannot be read, the original error will
 * be thrown, so we can handle it by proceeding to the next file.
 *
 * @param filename Name of the file to read
 * @returns The content of the file as a string
 */
async function readConfigFile(filename: string) {
  try {
    return await Deno.readTextFile(filename);
  } catch (cause) {
    if (
      cause instanceof Deno.errors.NotFound ||
      cause instanceof Deno.errors.PermissionDenied ||
      cause.code === "ERR_MODULE_NOT_FOUND"
    ) {
      throw cause;
    }

    throw new Error(
      `Failed to read file: ${cause.message}`,
      { cause },
    );
  }
}

/**
 * Parse a JSON configuration file.
 *
 * This function will parse the content of the provided file as JSON and return
 * the resulting object. If the content is not valid JSON, an error will be
 * thrown.
 *
 * @param filename Name of the file to parse
 * @returns The parsed configuration object
 */
async function parseJsonConfig(this: void, filename: string) {
  const content = await readConfigFile(filename);

  try {
    return JSON.parse(content) as Partial<ConfigurationInput>;
  } catch (cause) {
    throw new Error(
      `Failed to parse JSON: ${cause.message}`,
      { cause },
    );
  }
}

/**
 * Parse a YAML configuration file.
 *
 * This function will parse the content of the provided file as YAML and return
 * the resulting object. If the content is not valid YAML, an error will be
 * thrown.
 *
 * @param filename Name of the file to parse
 * @returns The parsed configuration object
 */
async function parseYamlConfig(this: void, filename: string) {
  const content = await readConfigFile(filename);

  try {
    return parseYaml(content) as Partial<ConfigurationInput>;
  } catch (cause) {
    throw new Error(
      `Failed to parse YAML: ${cause.message}`,
      { cause },
    );
  }
}

/**
 * Parse a TOML configuration file.
 *
 * This function will parse the content of the provided file as TOML and return
 * the resulting object. If the content is not valid TOML, an error will be
 * thrown.
 *
 * @param filename Name of the file to parse
 * @returns The parsed configuration object
 */
async function parseTomlConfig(this: void, filename: string) {
  const content = await readConfigFile(filename);

  try {
    return parseToml(content) as Partial<ConfigurationInput>;
  } catch (cause) {
    throw new Error(
      `Failed to parse YAML: ${cause.message}`,
      { cause },
    );
  }
}

/**
 * Parse a module configuration file.
 *
 * This function will import the content of the provided file as a module and
 * return the resulting object. If the content is not a valid module, an error
 * will be thrown.
 *
 * @param filename Name of the file to parse
 * @returns The parsed configuration object
 */
async function parseModuleConfig(this: void, filename: string) {
  try {
    return await import(filename) as Partial<ConfigurationInput>;
  } catch (cause) {
    if (cause.code === "ERR_MODULE_NOT_FOUND") {
      throw cause;
    }

    throw new Error(
      `Failed to parse module: ${cause.message}`,
      { cause },
    );
  }
}
