import { loadConfigurationFromFile, resolveConfigFileVariant } from "./_file.ts";
import { type ConfigurationInput, fields, parse } from "./_schema.ts";

/**
 * The prefix used for environment variables.
 *
 * This is used to generate the environment variable names from the
 * configuration schema keys, and prevent conflicts with other variables.
 */
const variablePrefix = "MERCURE";

/**
 * Load the configuration from the environment, configuration file, and
 * override arguments.
 *
 * The configuration is loaded and overwritten in the following order:
 *   1. Configuration file
 *   2. Environment variables
 *   3. Override arguments
 *
 * If no specific configuration file is provided, the function will try to
 * resolve the configuration file by trying the following locations:
 *  1. The current working directory
 *  2. The current working directory with `.config/` appended
 *  3. The XDG configuration home (usually `~/.config`) with `mercure/` appended
 *  3. The XDG configuration home
 *  4. The user's home directory with `.config/mercure/` appended
 *  5. The user's home directory with `mercure/` appended
 *  6. The system-wide configuration directory (hard-wired to `/etc/mercure`)
 *
 * For every directory, the function will try to load the configuration from
 * all supported file formats in the following order:
 *  1. TypeScript module: `<filename>.config.ts`
 *  2. JavaScript module: `<filename>.config.js`
 *  3. TOML file: `<filename>.toml`
 *  4. JSON file: `<filename>.json`
 *  5. YAML file: `<filename>.yaml`
 *  6. YAML file with short extension: `<filename>.yml`
 *
 * @param environment The environment variables
 * @param filename The configuration file to load, if any
 * @param args The override arguments, if any
 */
export async function loadConfiguration(
  environment: Deno.Env,
  filename?: string | undefined,
  args: Partial<ConfigurationInput> = {},
) {
  // If a specific configuration file has been provided, we'll decide which
  // parsing strategy we should use based on the file extension.
  const configFile = filename ? resolveConfigFileVariant(filename) : undefined;

  // Start with the configuration file, if one exists. Unless a specific file
  // has been provided, we'll try to load configuration from the default
  // locations in the working directory and the XDG configuration folder.
  const config = await loadConfigurationFromFile(configFile);

  // Then, override with environment variables. To avoid unexpected behaviour,
  // we pull the list of variables from the configuration schema, infer names
  // from the schema keys, and only check for those in the environment data.
  for (const key of fields) {
    const variable = optionToVariable(key);
    const value = environment.get(variable);

    if (value) {
      config[key] = coerce(value);

      continue;
    }

    // If we couldn't find the option in the environment variables as-is, we
    // check if there's a variable with the suffix "_FILE" that points to a
    // file containing the actual value. This is useful for secrets, for
    // example, where we don't want to expose the value in the environment.
    const fileVariable = asFileVariable(variable);

    if (environment.has(fileVariable)) {
      const path = environment.get(fileVariable)!;

      // If the file doesn't exist or can't be read, we throw an error;
      // The configuration is invalid, and it's not safe to continue.
      try {
        const value = await Deno.readTextFile(path);
        config[key] = coerce(value);
      } catch (cause) {
        throw new Error(
          `Failed to read secret file at "${path}" provided by "${fileVariable}": ${cause.message}`,
          { cause },
        );
      }
    }
  }

  // Finally, apply the override arguments. Those take the highest precedence.
  for (const [key, value] of Object.entries(args)) {
    // TODO: This check is not exhaustive. We should probably have a
    //       separate function to validate the arguments against the schema.
    if (value === undefined || (Array.isArray(value) && !value.length)) {
      continue;
    }

    // deno-lint-ignore no-explicit-any
    config[key as keyof typeof config] = value as any;
  }

  return parse({ ...config } as ConfigurationInput);
}

/**
 * Convert an option name to an environment variable name.
 *
 * @param option The option name
 * @param prefix The prefix to use for the environment variable
 * @example optionToVariable("publicUrl") // yields "MERCURE_PUBLIC_URL"
 */
function optionToVariable(option: string, prefix = variablePrefix) {
  return prefix + "_" + option
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toUpperCase();
}

/**
 * Convert an option name to an environment variable name for a file.
 *
 * @param variable The variable name
 * @example asFileVariable("MERCURE_JWK") // yields "MERCURE_JWK_FILE"
 */
function asFileVariable(variable: string) {
  return `${variable}_FILE`;
}

function coerce<T>(value: string): T {
  if (value === "true") {
    return true as T;
  }

  if (value === "false") {
    return false as T;
  }

  if (value.startsWith("base64:")) {
    return atob(value.slice(7)) as T;
  }

  return value as T;
}

export type { Configuration, ConfigurationInput } from "./_schema.ts";
