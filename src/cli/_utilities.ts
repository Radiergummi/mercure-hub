import { iterateReaderSync } from "@std/io";

export function resolveFileOption(this: void, value: string) {
  if (value === "-") {
    const decoder = new TextDecoder();

    return [...iterateReaderSync(Deno.stdin)]
      .map((chunk) => decoder.decode(chunk))
      .join("");
  }

  // Apply some heuristics to check whether this might be a file
  // path, and if so, try to read the file. If this fails for
  // whatever reason, treat the value as a literal JWK and
  // continue; the error will be caught during validation later.
  if (
    value && (
      value.startsWith("/") ||
      value.startsWith(".") ||
      /^[a-zA-Z]:[\\/]/.test(value)
    )
  ) {
    try {
      Deno.statSync(value);

      return Deno.readTextFileSync(value);
    } catch {
      // Ignore errors and return the value verbatim
    }
  }

  return value.toString();
}
