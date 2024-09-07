import { type JWTPayload, jwtVerify, type JWTVerifyOptions, type KeyLike, SignJWT } from "jose";

export function issueJwt(key: JsonWebKey, algorithm: string, options: JwtOptions) {
  const factory = new SignJWT({
    mercure: JSON.stringify({
      publish: options.publish ?? undefined,
      subscribe: options.subscribe ?? undefined,
      payload: options.payload ?? undefined,
    }),
  });

  factory
    .setProtectedHeader({ alg: algorithm })
    .setJti(options.id ?? `urn:uuid:${crypto.randomUUID()}`)
    .setAudience(options.audience)
    .setSubject(options.subject)
    .setIssuer(options.issuer)
    .setIssuedAt(options.issuedAt ?? new Date());

  if (options.expire) {
    factory.setExpirationTime(options.expire);
  }

  if (options.notBefore) {
    factory.setNotBefore(options.notBefore);
  }

  return factory.sign(key);
}

export async function verifyJwt(
  key: JsonWebKey,
  token: string,
  options?: JWTVerifyOptions,
) {
  const requiredClaims = options?.requiredClaims?.filter((claim) => claim !== "mercure") ?? [];

  try {
    return await jwtVerify<MercureTokenPayload>(token, key, {
      ...options,
      requiredClaims: [...requiredClaims, "mercure"],
    });
  } catch (cause) {
    throw new Error(`Failed to verify JWT: ${cause.message}`, { cause });
  }
}

type JwtOptions = {
  id?: string;
  audience: string;
  subject: string;
  issuer: string;
  issuedAt?: Date;
  expire?: string;
  notBefore?: Date;
  publish?: string[];
  subscribe?: string[];
  payload?: string;
};

export type MercureTokenPayload = JWTPayload & { mercure?: string };

export type JsonWebKey = KeyLike | Uint8Array;
