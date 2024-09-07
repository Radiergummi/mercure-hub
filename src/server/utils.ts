import { serveDir, type ServeDirOptions, serveFile, type ServeFileOptions } from "@std/http";
import { HttpError } from "./_errors.ts";
import type { HandlerFn, RequestContext } from "./router.ts"; // region Resolve accepted media types

// region Resolve accepted media types
/**
 * Adapted from HAPI.js
 *
 * @param request
 * @see https://github.com/hapijs/accept/blob/master/lib/media.js
 */
export function resolveAcceptedMediaTypes(request: Request) {
  const raw = request.headers.get("accept");

  if (!raw) {
    return ["*/*"];
  }

  const { header, quoted } = normalize(raw);

  // Parse selections
  const parts = header.split(",");
  const selections: Selection[] = [];

  for (let i = 0; i < parts.length; ++i) {
    const part = parts[i];

    // Ignore empty parts or leading commas
    if (!part) {
      continue;
    }

    // Parse parameters
    const pairs = part.split(";");
    const token = pairs.shift()!.toLowerCase();

    // Ignore invalid types
    if (!isMediaType(token)) {
      continue;
    }

    const selection: Selection = {
      token,
      type: undefined,
      subType: undefined,
      weight: 1,
      params: {},
      specificity: 0,
      position: i,
    };

    // Parse key=value
    for (const pair of pairs) {
      let key: string;
      let value: string | number | undefined;

      // eslint-disable-next-line prefer-const
      [key, value] = pair.split("=", 2);

      if (typeof value === "undefined") {
        continue;
      }

      if (key.toLowerCase() === "q") {
        value = Number(value);

        if (
          !Number.isFinite(value) || value > 1 ||
          (value < 0.001 && value !== 0)
        ) {
          value = 1;
        }

        selection.weight = value;
      } else {
        if (value.startsWith('"')) {
          value = `"${quoted[value]}"`;
        }

        selection.params[key] = value;
      }
    }

    const params = Object.keys(selection.params);
    selection.specificity = params.length;

    // Default no preference to q=1 (top preference)
    if (selection.weight === undefined) {
      selection.weight = 1;
    }

    const [type, subType] = selection.token.split("/", 2);
    selection.type = type;
    selection.subType = subType;

    // Skip denied selections (q=0)
    if (selection.weight > 0) {
      selections.push(selection);
    }
  }

  // Sort selection based on q and then position in header
  return selections
    .toSorted(sort)
    .map<MediaType>(({ token }) => token);
}

function sort(a: Selection, b: Selection) {
  // Sort by quality score
  if (b.weight !== a.weight) {
    return b.weight - a.weight;
  }

  // Sort by type
  if (a.type !== b.type) {
    return innerSort(a, b, "type");
  }

  // Sort by subtype
  if (a.subType !== b.subType) {
    return innerSort(a, b, "subType");
  }

  // Sort by specificity
  if (a.specificity !== b.specificity) {
    return b.specificity - a.specificity;
  }

  return a.position - b.position;
}

function innerSort(
  a: Selection,
  b: Selection,
  key: keyof Selection & ("type" | "subType"),
) {
  const aValue = a[key];
  const bValue = b[key];

  if (a[key] === "*") {
    return 1;
  }

  if (b[key] === "*") {
    return -1;
  }

  // Group alphabetically
  return aValue?.localeCompare(bValue ?? "") ?? 0;
}

function normalize(header: string) {
  const quoted: Record<string, string> = {};
  header = header || "*/*";

  if (header.includes('"')) {
    let i = 0;

    header = header.replace(/="([^"]*)"/g, (_$0, $1) => {
      const key = '"' + ++i;
      quoted[key] = $1;

      return "=" + key;
    });
  }

  header = header.replace(/[ \t]/g, "");

  return { header, quoted };
}

/**
 * {@link https://tools.ietf.org/html/rfc7231#section-5.3.2|RFC 7231 Section 5.3.2}
 *
 * ```abnf
 * Accept          = [ ( "," / ( media-range [ accept-params ] ) ) *( OWS "," [ OWS ( media-range [ accept-params ] ) ] ) ]
 * media-range     = ( "* /*" / ( type "/*" ) / ( type "/" subtype ) ) *( OWS ";" OWS parameter )
 * accept-params   = weight *accept-ext
 * accept-ext      = OWS ";" OWS token [ "=" ( token / quoted-string ) ]
 * type            = token
 * subtype         = token
 * parameter       = token "=" ( token / quoted-string )
 *
 * quoted-string   = DQUOTE *( qdtext / quoted-pair ) DQUOTE
 * qdtext          = HTAB / SP /%x21 / %x23-5B / %x5D-7E / obs-text
 * obs-text        = %x80-FF
 * quoted-pair     = "\" ( HTAB / SP / VCHAR / obs-text )
 * VCHAR           = %x21-7E                                ; visible (printing) characters
 * token           = 1*tchar
 * tchar           = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
 * OWS             = *( SP / HTAB )
 * ```
 *
 * Examples:
 *  - `Accept: audio/*; q=0.2, audio/basic`
 *  - `Accept: text/plain; q=0.5, text/html, text/x-dvi; q=0.8, text/x-c`
 *  - `Accept: text/plain, application/json;q=0.5, text/html, * /*; q = 0.1`
 *  - `Accept: text/plain, application/json;q=0.5, text/html, text/drop;q=0`
 *  - `Accept: text/*, text/plain, text/plain;format=flowed, * /*`
 *  - `Accept: text/*;q=0.3, text/html;q=0.7, text/html;level=1, text/html;level=2;q=0.4, * /*;q=0.5`
 *  - `RFC 7231 Section 5.3.1 (https: *tools.ietf.org/html/rfc7231#section-5.3.1)`
 *
 * The weight is normalized to a real number in the range 0 through 1, where
 * 0.001 is the least preferred and 1 is the most preferred; a value of 0 means
 * "not acceptable". If no "q" parameter is present, the default weight is 1.
 *
 * ```
 * weight = OWS ";" OWS "q=" qvalue
 * qvalue = ( "0" [ "." 0*3DIGIT ] ) / ( "1" [ "." 0*3("0") ] )
 * ```
 */
const validMediaTypeRegex =
  /^\*\/\*|[\w!#$%&'*+\-.^`|~]+\/\*|[\w!#$%&'*+\-.^`|~]+\/[\w!#$%&'*+\-.^`|~]+$/;

function isMediaType(value: string): value is MediaType {
  return validMediaTypeRegex.test(value);
}

type MediaType = `${string}/${string}`;

interface Selection {
  token: MediaType;
  type: string | undefined;
  subType: string | undefined;
  weight: number;
  params: Record<string, unknown>;
  specificity: number;
  position: number;
}

// endregion

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function redirect(location: string, status = 302) {
  return new Response(
    `Redirecting to ${location}`,
    { status, headers: { location } },
  );
}

export function asset(
  path: string,
  options?: ServeFileOptions & {
    headers?: HeadersInit | ((context: RequestContext) => Headers);
  },
): HandlerFn {
  return async (context) => {
    const response = await serveFile(context.request, path, {
      ...options,
    });

    if (options?.headers) {
      const headers = typeof options.headers === "function"
        ? options.headers(context)
        : new Headers(options.headers);

      for (const [key, value] of headers) {
        response.headers.set(key, value);
      }
    }

    return response;
  };
}

export function assets(path: string, options?: ServeDirOptions): HandlerFn {
  return ({ request }) =>
    serveDir(request, {
      fsRoot: path,
      ...options,
    });
}

export function checkContentType(request: Request, acceptedType: string) {
  const contentType = request.headers.get("content-type");

  if (!contentType) {
    throw new HttpError(
      400,
      "Bad Request: Missing Content Type",
    );
  }

  if (!contentType.startsWith(acceptedType)) {
    throw new HttpError(
      415,
      `Unsupported Media Type: Use ${acceptedType}`,
      { "accept": acceptedType },
    );
  }
}

export async function parseFormBody(request: Request) {
  try {
    return await request.formData();
  } catch (error) {
    throw new HttpError(
      400,
      "Bad Request: Malformed body",
      {},
      error,
    );
  }
}

export function extractFormData(formData: FormData) {
  return [
    ...formData.entries(),
  ].reduce<Record<string, FormDataEntryValue | FormDataEntryValue[]>>(
    (data, [key, value]) => ({
      ...data,
      [key]: key in data
        ? Array.isArray(data[key]) ? [...data[key], value] : [data[key], value]
        : value,
    }),
    {},
  );
}

export function compareUrlPattern(a: URLPattern, b: URLPattern) {
  return urlPatternToString(a) === urlPatternToString(b);
}

export function urlPatternToString(pattern: URLPattern) {
  const origin = pattern.hostname + (pattern.port ? `:${pattern.port}` : "");
  const search = pattern.search && pattern.search !== "*" ? `?${pattern.search}` : "";
  const hash = pattern.hash && pattern.hash !== "*" ? `#${pattern.hash}` : "";

  return pattern.protocol + "://" +
    origin +
    pattern.pathname +
    search +
    hash;
}

export type MaybePromise<T> = T | Promise<T>;
