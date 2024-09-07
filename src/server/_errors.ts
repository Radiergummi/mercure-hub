import type { ZodError } from "zod";

export type ResponsableError = {
  status: number;
  headers: HeadersInit;

  toJSON(): Record<string, unknown>;
  toString(): string;
};

export class HttpError extends Error implements ResponsableError {
  public readonly status: number;
  public readonly headers: HeadersInit;

  constructor(
    status: number,
    message: string,
    headers: HeadersInit = {},
    cause?: Error,
  ) {
    super(message, { cause });
    this.status = status;
    this.headers = headers;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      status: this.status,
      error: this.message,
    };
  }

  toString() {
    return this.message;
  }
}

export class ValidationError extends Error implements ResponsableError {
  public readonly headers = {} as const;
  public readonly status = 400;
  public readonly cause: ZodError;

  constructor(cause: ZodError) {
    super("Bad Request: Invalid payload", { cause });
    this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      status: this.status,
      error: this.message,
      errors: this.cause.flatten().fieldErrors,
    };
  }

  toString() {
    return this.cause.issues.map(({ message }) => message).join("; ");
  }
}
