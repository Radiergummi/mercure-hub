import { assertNotEquals, assertStringIncludes } from "@std/assert";
import { generateId } from "./updates.ts";

Deno.test("Generate a new update ID", () => {
  const id = generateId();

  assertStringIncludes(id, "urn:uuid:");
  assertNotEquals(id, generateId());
});
