import type { Configuration } from "./config/mod.ts";
import { MemoryTransport } from "./transports/memory.ts";
import { createTransport, registerTransport } from "./transports/mod.ts";
import { RedisTransport } from "./transports/redis.ts";

/**
 * Set up the event transport.
 *
 * This function will create a transport instance based on the provided URI.
 * If the URI is invalid or the transport is not supported, an unrecoverable
 * error will be thrown.
 *
 * @param uri The URI to connect to
 * @param apiEnabled Whether the subscriptions API should be enabled
 */
export async function setupTransport({
  transportUri: uri = "memory:",
  subscriptionsApi: apiEnabled = false,
}: TransportOptions = {}) {
  if (!uri) {
    throw new Error(`Transport connection failed: Missing URI`);
  }

  let transportUri;

  try {
    transportUri = new URL(uri);
  } catch (cause) {
    throw new Error("Transport connection failed: Invalid URI", { cause });
  }

  // Register all transports. This could be solved more elegantly, if we had
  // a nice way to automatically import all files in a directory.
  registerTransports();

  try {
    return await createTransport(transportUri, apiEnabled);
  } catch (cause) {
    throw new Error(`Transport connection failed: ${cause.message}`, { cause });
  }
}

/**
 * Register all transports.
 *
 * This should be done automatically, but we don't have a nice way to import
 * all files in a directory yet.
 */
function registerTransports() {
  // TODO: Automatically import all files in the transports directory
  registerTransport(new MemoryTransport());
  registerTransport(new RedisTransport());
}

type TransportOptions = Partial<Pick<Configuration, "transportUri" | "subscriptionsApi">>;
