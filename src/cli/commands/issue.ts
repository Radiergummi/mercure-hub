import {
  type ArgumentValue,
  Command,
  EnumType,
  type TypeHandler,
  ValidationError,
} from "@cliffy/command";
import { blue, gray, green, yellow } from "@std/fmt/colors";
import { importJWK } from "jose";
import { issueJwt } from "../../jws.ts";
import { resolveFileOption } from "../_utilities.ts";

// region JWK
const supportedAlgorithms = new EnumType(["SHA-256", "SHA-384", "SHA-512"] as const);
const defaultAlgorithm = "SHA-512";
const IssueJwk = new Command()
  .name("jwk")
  .description("Issue a new secret JWK for the Mercure Hub to issue JWTs with.")
  .type("algo", supportedAlgorithms)
  .option("-a, --algorithm <algorithm:algo>", "Key Algorithm to use", {
    default: defaultAlgorithm,
  })
  .action(async (options) => {
    const { algorithm } = options;
    const key = await crypto.subtle.generateKey(
      { name: "HMAC", hash: algorithm },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", key);

    if (Deno.stdout.isTerminal()) {
      console.dir(jwk);
    } else {
      console.log(JSON.stringify(jwk));
    }
  })
  .example("Generate a secret key and print it as a JSON Web Key", "mercure issue jwk")
  .example(
    "Generate a secret key using the SHA-256 algorithm",
    `mercure issue jwk -a ${yellow("SHA-256")}`,
  )
  .example(
    "Save the secret key to a file",
    `mercure issue jwk ${gray(">")} ${blue("key.json")}`,
  )
  .example(
    "Encode the secret key in base64",
    `mercure issue jwk ${gray("|")} ${blue("base64")}`,
  );
// endregion

const dateType = function dateType({ value }: ArgumentValue) {
  return value ? new Date(value) : undefined;
} satisfies TypeHandler<Date | undefined>;

// region JWT
const IssueJwt = new Command()
  .name("jwt")
  .description("Issue a new JWT using an existing JWK to authenticate with.")
  .type("date", dateType)
  // region General Options
  .option(
    "--jwk <key:file>",
    `JWK to use for verifying both publisher and subscriber JWTs. Pass the special value ` +
      `${blue("-")} to read from stdin, a file path to read from a file, or the ` +
      `plain JWK string.`,
    { value: resolveFileOption, required: true },
  )
  // endregion

  // region Mercure Options
  .group("Mercure Options")
  .option(
    "-p, --publish <topic>",
    "Topic to authorize for publishing. Can be used multiple times.",
    { collect: true },
  )
  .option(
    "-s, --subscribe <topic>",
    "Topic to authorize for subscribing. Can be used multiple times.",
    { collect: true },
  )
  .option("-P, --payload <payload>", "The Mercure payload to include in the token.")
  // endregion

  // region JWT Options
  .group("JWT Options")
  .option(
    "--id <id>",
    `Unique identifier of the JWT (${green("jti")} claim). Defaults to a random string.`,
  )
  .option(
    "-e, --expire <duration>",
    `Time after which the JWT expires (${green("exp")} claim). Defaults to ${blue("1h")}.`,
  )
  .option(
    "--audience <audience>",
    `Recipient for which the JWT is intended (${green("aud")} claim). ` +
      `Defaults to ${blue("mercure")}.`,
    { default: "mercure" },
  )
  .option(
    "--subject <subject>",
    `Subject of the JWT, usually the user (${green("sub")} claim). ` +
      `Defaults to ${blue("mercure")}.`,
    { default: "mercure" },
  )
  .option(
    "--issuer <issuer>",
    `Issuer of the JWT (${green("iss")} claim). Defaults to ${blue("mercure")}.`,
    { default: "mercure" },
  )
  .option(
    "--not-before <time:date>",
    `Time before which the JWT must not be accepted for processing ` +
      `(${green("nbf")} claim). Defaults to now.`,
  )
  .option(
    "--issued-at <time:date>",
    `Time at which the JWT was issued; can be used to determine age of the JWT ` +
      `(${green("iat")} claim). Defaults to now.`,
  )
  // endregion

  .action(async function (options) {
    let jwk;
    let key;

    try {
      jwk = JSON.parse(options.jwk);
      key = await importJWK(jwk);
    } catch (cause) {
      throw new ValidationError(`Invalid JWK: ${cause.message}`);
    }

    const token = await issueJwt(key, jwk.alg, options);

    console.log(token);
  });
// endregion

export const Issue = new Command()
  .name("issue <kind:jws-kind>")
  .type("jws-kind", new EnumType(["jwk", "jwt"] as const))
  .description("Issue a new JSON Web Secret for the Mercure Hub.")
  .command(IssueJwk.getName(), IssueJwk)
  .command(IssueJwt.getName(), IssueJwt);
