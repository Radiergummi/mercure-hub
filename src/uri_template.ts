import { type Expression, parse, type Term, type VariableExpression } from "deno_uri_template";
import { LRU } from "lru";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uriTemplateToRegex(template: string): RegExp {
  // Parse the template into expressions
  const expressions = parse(template);

  // Initialize regex pattern
  let regexString = "^"; // Start of the string

  for (const expression of expressions) {
    if (expression.type === "Literal") {
      // Escape literal values
      regexString += escapeRegExp(expression.value);
    } else if (expression.type === "Variable") {
      const {
        terms,
        separator,
        first,
        allowReserved,
        ifEmpty,
      } = expression;

      const variablePatterns = terms.map((term) => {
        let pattern = "[^/?#]*"; // Default pattern to match any character except `/`, `?`, and `#`

        // Truncate the length of the value
        if (term.truncate > 0) {
          pattern = `.{0,${term.truncate}}`;
        }

        // Explode with separator
        if (term.explode) {
          pattern = `(?:[^/?#]*${separator}[^/?#]*)*`;
        }

        // Allow reserved characters
        if (allowReserved) {
          pattern = `[^\\/?#]*`;
        }

        return pattern;
      }).join(separator === "," ? "|" : separator); // Join with the separator

      // Handle special characters based on `first` character
      if (first === "#") {
        regexString += `(${variablePatterns})`;
      } else if (first === ".") {
        regexString += `\\.${variablePatterns}`;
      } else if (first === "/") {
        regexString += `/${variablePatterns}`;
      } else if (first === ";") {
        regexString += `;(${variablePatterns})`;
      } else if (first === "?") {
        regexString += `\\?(${variablePatterns})`;
      } else if (first === "&") {
        regexString += `&(${variablePatterns})`;
      } else {
        regexString += `(${variablePatterns})`;
      }

      // Handle `ifEmpty` value
      if (ifEmpty) {
        regexString += `|${escapeRegExp(ifEmpty)}`;
      }
    }
  }

  regexString += "$"; // End of the string

  // Return the regex with case-insensitive flag
  return new RegExp(regexString, "i");
}

export function extractUriTemplate(template: string, uri: string) {
  const regex = uriTemplateToRegex(template);
  const match = uri.match(regex);

  return match !== null;
}

const conversionCache = new LRU<URLPattern>(10_000);

export function convertToUrlPattern(template: string, baseURL?: URL) {
  if (conversionCache.has(template)) {
    return conversionCache.get(template)!;
  }

  const input = template.includes("{") ? parse(template).reduce(convertExpression, "") : template;

  let pattern: URLPattern;

  try {
    pattern = baseURL ? new URLPattern(input, baseURL.origin.toString()) : new URLPattern(input);
  } catch (cause) {
    throw new Error(
      `Failed to convert "${input}" to URLPattern: ${cause.message}`,
      { cause },
    );
  }

  conversionCache.set(template, pattern);

  return pattern;
}

function convertExpression(
  this: void,
  result: string,
  expression: Expression,
) {
  if (expression.type === "Literal") {
    return result + expression.value;
  }

  const terms = expression.terms.map(
    (term) => buildTerm(term, expression),
  );

  switch (expression.first) {
    case "":
      return result + terms.join(expression.separator);

    case "?":
    case "#":
      return result.includes(expression.first) ? result : (result + expression.first +
        terms.join(expression.separator));

    case ".":
      return result.endsWith("/")
        ? `${result}{${expression.first}${terms.shift() ?? ""}}${
          terms.length > 0
            ? expression.separator +
              terms.join(expression.separator)
            : ""
        }`
        : result + expression.first +
          terms.join(expression.separator);

    case "/":
      return result.replace(/\/+$/, "") +
        expression.first +
        terms.join(expression.separator);

    case ";":
    case "&":
      return result + expression.first +
        terms.join(expression.separator);

    default:
      return result;
  }
}

function buildTerm(
  term: Term,
  expression: VariableExpression,
): string {
  let value = `:${term.name}`;

  if (expression.named) {
    value = term.name + value;
  }

  if (term.truncate > 0 || expression.allowReserved) {
    const pattern = expression.allowReserved ? "." : ".[^/]";
    const quantifier = term.truncate > 0 ? `{${term.truncate}}` : "+";

    value += `(${pattern}${quantifier})`;
  }

  return value + (term.explode ? "*" : "");
}
