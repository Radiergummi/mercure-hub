import { type LevelName, LogLevelNames } from "@std/log";
import { createRemoteJWKSet, importJWK, type JWK } from "jose";
import { NEVER, type RefinementCtx, z, ZodIssueCode, type ZodSchema } from "zod"; // region Validation Handlers
import type { JsonWebKey } from "../jws.ts";

// region Validation Handlers
async function validateJwk(
  value: string,
  ctx: RefinementCtx,
): Promise<readonly [JsonWebKey, string]> {
  let jwk: JWK;

  try {
    jwk = JSON.parse(value);
  } catch (cause) {
    ctx.addIssue({
      code: "custom",
      message: `Invalid JSON: ${cause}`,
    });

    return NEVER;
  }

  try {
    return [await importJWK(jwk), jwk.alg!] as const;
  } catch (error) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      message: `Invalid JWK: ${error.message}`,
    });

    return NEVER;
  }
}

async function validateJwks(
  value: string,
  ctx: RefinementCtx,
): Promise<RemoteJsonWebKeySet> {
  const keySet = createRemoteJWKSet(new URL(value));

  try {
    await keySet.reload();
  } catch (cause) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      message: `Failed to load JWKS from URL: ${cause.message}`,
    });

    return NEVER;
  }

  return keySet;
}

type RemoteJsonWebKeySet = ReturnType<typeof createRemoteJWKSet>;
// endregion

// region Zod Schema Field Extraction
function extractSchemaFields<S extends ZodSchema>(schema: S) {
  const extract = (fields: ZodSchemaFields): string[] =>
    Object.entries(fields).reduce<string[]>(
      (keys, [key, value]) =>
        value === true ? [...keys, key] : keys.concat(
          extract(value).map((subKey) => `${key}.${subKey}`),
        ),
      [],
    );

  return extract(getZodSchemaFields(schema)) as (keyof S["_output"])[];
}

function getZodSchemaFields<T>(schema: ZodSchema<T>) {
  const fields = {};

  schema.safeParse(new Proxy(fields, proxyHandler));

  return clean(fields);
}

const proxyHandler = {
  get(fields: DirtyZodSchemaFields, key: string | symbol) {
    if (key === "then" || typeof key !== "string") {
      return;
    }

    if (!fields[key]) {
      fields[key] = new Proxy({}, proxyHandler);
    }

    return fields[key];
  },
};

function clean(fields: DirtyZodSchemaFields): ZodSchemaFields {
  return Object
    .keys(fields)
    .reduce<ZodSchemaFields>((cleaned, key) => ({
      ...cleaned,
      [key]: Object.keys(fields[key]).length ? clean(fields[key]) : true,
    }), {});
}

type ZodSchemaFields = { [K: string]: ZodSchemaFields | true };
type DirtyZodSchemaFields = { [K: string]: DirtyZodSchemaFields };
// endregion

const logLevels = LogLevelNames.map<Lowercase<LevelName>>((level) =>
  level.toLowerCase() as Lowercase<LevelName>
) as [Lowercase<LevelName>, ...Lowercase<LevelName>[]];

const schema = z
  .object({
    listenAddress: z
      .string({
        description:
          `Separate address to expose metrics on. This can be a TCP address in the form ` +
          `tcp://<host>:<port> or a Unix socket address in the form unix:///path/to/socket.`,
      })
      .and(z.union([
        z.custom<`${string}:${string}`>((value) => value?.toString().match(/^[a-z\d.-]+:\d+$/i)),
        z.custom<`tcp://${string}:${string}`>((value) =>
          value?.toString().match(/^tcp:\/\/.+:\d+$/)
        ),
        z.custom<`unix://${string}`>((value) =>
          value?.toString().startsWith("unix://") && value.length > 7
        ),
      ]))
      .default("tcp://localhost:8000")
      .transform((value, ctx): URL | undefined => {
        try {
          return new URL(value.includes("://") ? value : `tcp://${value}`);
        } catch {
          ctx.addIssue({
            code: ZodIssueCode.custom,
            message:
              "The listen address must be a valid endpoint URL, either for a TCP or Unix socket.",
          });
        }

        return undefined;
      }),
    transportUri: z
      .string({
        description: `The connection DSN to use for the event transport. The URL scheme will ` +
          `be used to identify the transport adapter to use.`,
      })
      .url()
      .default("memory:"),

    // region Logging Options
    logLevel: z
      .enum(logLevels, {
        description: `The log level to use for runtime logging.`,
      })
      .default("info")
      .transform((value): LevelName => value.toUpperCase() as LevelName),
    logFormat: z
      .enum(["json", "console", "auto"], {
        description:
          `The format to use for runtime logging. If "auto", it will use JSON in non-interactive ` +
          `environments and console in interactive ones.`,
      })
      .default("auto"),
    logColors: z
      .union([z.literal("auto"), z.boolean()], {
        description:
          `Whether to use colors in log output. If "auto", it will use colors in interactive environments.`,
      })
      .default("auto"),
    // endregion

    // region Client Connection Options
    allowedOrigins: z
      .preprocess(
        (value: unknown) => {
          if (Array.isArray(value)) {
            return value;
          }

          return typeof value === "string" ? value.split(",") : value;
        },
        z.array(
          z.union([
            z.literal("*"),
            z.string().url(),
          ]),
          {
            description:
              `The list of origins allowed to connect to the hub. The special value "*" allows all origins.`,
          },
        )
          .default(["*"]),
      ),
    cookieName: z
      .string({
        description: `The name of the cookie used to store the authorization token.`,
      })
      .default("mercureAuthorization"),
    heartbeatInterval: z
      .number({
        coerce: true,
        message: "The heartbeat interval must be specified as a number of milliseconds.",
        description: "The interval between heartbeat messages, in milliseconds.",
      })
      .int("The heartbeat interval must be an integer; fractional values are not supported.")
      .positive("The heartbeat interval must be a positive amount of milliseconds.")
      .min(100, "The heartbeat interval must be at least 100 milliseconds.")
      .optional()
      .default(30_000),
    queryParamAuthorization: z
      .boolean({
        description: "Whether to allow subscribers to authenticate " +
          "using a query parameter. This method is not recommended " +
          "due to its security deficiencies.",
      })
      .default(false),
    anonymousAccess: z
      .boolean({
        description: "Whether subscribers without a valid token " +
          "should be allowed to connect.",
      })
      .default(false),
    // endregion

    // region Metrics Options
    metrics: z
      .boolean({
        description: `Whether the metrics exporter should be enabled.`,
      })
      .default(false),
    metricsEndpoint: z
      .string({
        description: `The path to publish the Prometheus metrics endpoint at.`,
      })
      .regex(/^\/\S+$/, "The metrics endpoint must start with a slash.")
      .default("/metrics"),
    observabilityListenAddress: z
      .string({
        description: `A separate address to listen on for incoming ` +
          `connections for the observability features. This can be ` +
          `a TCP address in the form tcp://<host>:<port> or a Unix ` +
          `socket address in the form unix:///path/to/socket.`,
      })
      .url()
      .optional()
      .and(z.union([
        z.custom<`tcp://${string}:${string}`>((value) => (
          typeof value === "undefined" ||
          value.toString().match(/^tcp:\/\/.+:\d+$/)
        )),
        z.custom<`unix://${string}`>((value) =>
          typeof value === "undefined" || (
            value?.toString().startsWith("unix://") &&
            value.length > 7
          )
        ),
      ]))
      .transform((value) => value ? new URL(value) : undefined),
    // endregion

    subscriptionsApi: z
      .boolean({
        description: `Whether the subscriptions API should be enabled.`,
      })
      .default(false),
    webUi: z
      .boolean({
        description: `Whether the web UI should be enabled.`,
      })
      .default(false),
    healthCheck: z
      .boolean({
        description: `Whether to enable the health check endpoint.`,
      })
      .default(true),
  })
  // region JWK Options
  .and(z.union([
    // { jwk: string }
    z.object({
      jwk: z
        .string({
          required_error: "Either a shared JWK, separate publisher and " +
            "subscriber JWKs, or JWKS URLs are required.",
          description: "The JSON Web Key (JWK) to use for verifying tokens.",
        })
        .transform((value, ctx) => validateJwk(value, ctx)),
      publishJwk: z.undefined().optional(),
      subscribeJwk: z.undefined().optional(),
      jwksUrl: z.undefined().optional(),
      publishJwksUrl: z.undefined().optional(),
      subscribeJwksUrl: z.undefined().optional(),
    })
      .transform((value) => ({
        ...value,
        publishJwk: value.jwk,
        subscribeJwk: value.jwk,
      })),

    // { publishJwk: string, subscribeJwk: string }
    z.object({
      jwk: z.undefined(),
      publishJwk: z
        .string({
          required_error: "A separate publisher JWK is required when no shared JWK is provided.",
          description: "The JSON Web Key (JWK) used to verify publisher tokens.",
        })
        .transform((value, ctx) => validateJwk(value, ctx)),
      subscribeJwk: z
        .string({
          required_error: "A separate subscriber JWK is required when no shared JWK is provided.",
          description: "The JSON Web Key (JWK) used to verify subscriber tokens.",
        })
        .transform((value, ctx) => validateJwk(value, ctx)),
      jwksUrl: z.undefined().optional(),
      publishJwksUrl: z.undefined().optional(),
      subscribeJwksUrl: z.undefined().optional(),
    }),

    // { jwksUrl: string }
    z.object({
      jwk: z.undefined().optional(),
      publishJwk: z.undefined().optional(),
      subscribeJwk: z.undefined().optional(),
      publishJwksUrl: z.undefined().optional(),
      subscribeJwksUrl: z.undefined().optional(),
      jwksUrl: z
        .string({
          required_error: "A JWKS URL is required when no JWK is provided.",
          description: "The URL to the JWK Set containing the keys used to verify tokens.",
        })
        .url()
        .transform(validateJwks),
    })
      .transform((value) => ({
        ...value,
        publishJwksUrl: value.jwksUrl,
        subscribeJwksUrl: value.jwksUrl,
      })),

    // { publishJwksUrl: string, subscribeJwksUrl: string }
    z.object({
      jwk: z.undefined().optional(),
      publishJwk: z.undefined().optional(),
      subscribeJwk: z.undefined().optional(),
      publishJwksUrl: z
        .string({
          required_error:
            "A publisher JWKS URL is required when a subscriber JWKS URL is provided.",
          description:
            "The URL to the JWK Set containing the keys used to verify publisher tokens.",
        })
        .url()
        .transform(validateJwks),
      subscribeJwksUrl: z
        .string({
          required_error:
            "A subscriber JWKS URL is required when a publisher JWKS URL is provided.",
          description:
            "The URL to the JWK Set containing the keys used to verify subscriber tokens.",
        })
        .url()
        .transform(validateJwks),
    }),
  ]));
// endregion

export function parse(config: ConfigurationInput) {
  return schema.parseAsync(config);
}

export const fields = extractSchemaFields(schema);

export type ConfigurationSchema = typeof schema;
export type Configuration = z.output<ConfigurationSchema>;
export type ConfigurationInput = z.input<ConfigurationSchema>;
