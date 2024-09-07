export class CommandError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode: number, cause?: unknown) {
    super(message, { cause });
    Error.captureStackTrace(this, this.constructor);
    this.exitCode = exitCode;
  }
}

export class InvocationError extends CommandError {
  constructor(
    message: string,
    exitCode: number,
    cause?: Error,
  ) {
    super(message, exitCode, { cause });
  }
}

export class ParseError extends CommandError {
  constructor(message: string, cause?: Error) {
    super(message, 2, { cause });
  }
}
