import type { MaybePromise } from "./server/utils.ts";

export function mockFs(
  mockFiles: Record<string, string> | ((path: string) => Promise<string>),
) {
  globalThis.Deno.readTextFile = (path, _options) => {
    path = path.toString();

    if (typeof mockFiles === "function") {
      return mockFiles(path);
    }

    if (path in mockFiles) {
      return Promise.resolve(mockFiles[path]);
    }

    return Promise.reject(new Deno.errors.NotFound("File not found"));
  };
}

export function mockReadTextFile<T>(
  mockFiles: Record<string, string> | ((path: string) => Promise<string>),
  callback: () => MaybePromise<T>,
) {
  return withGlobalMock(
    () => globalThis.Deno.readTextFile.bind(globalThis.Deno),
    () => mockFs(mockFiles),
    (original) => {
      globalThis.Deno.readTextFile = original;
    },
    callback,
  );
}

export function mockCwd<T>(directory: string, callback: () => T) {
  return withGlobalMock(
    () => globalThis.Deno.cwd.bind(globalThis.Deno),
    () => globalThis.Deno.cwd = () => directory,
    (original) => {
      globalThis.Deno.cwd = original;
    },
    callback,
  );
}

export function mockEnv<T>(
  mockEnv: Record<string, string>,
  callback: () => T,
) {
  return withGlobalMock(
    () => ({
      has: globalThis.Deno.env.has.bind(globalThis.Deno.env),
      get: globalThis.Deno.env.get.bind(globalThis.Deno.env),
      set: globalThis.Deno.env.set.bind(globalThis.Deno.env),
      delete: globalThis.Deno.env.delete.bind(globalThis.Deno.env),
      toObject: globalThis.Deno.env.toObject.bind(globalThis.Deno.env),
    }),
    () => {
      globalThis.Deno.env.has = (key) => key in mockEnv;
      globalThis.Deno.env.get = (key) => mockEnv[key];
      globalThis.Deno.env.set = (key, value) => mockEnv[key] = value;
      globalThis.Deno.env.delete = (key) => delete mockEnv[key];
      globalThis.Deno.env.toObject = () => mockEnv;
    },
    ({ delete: del, get, has, set, toObject }) => {
      globalThis.Deno.env.has = has;
      globalThis.Deno.env.toObject = toObject;
      globalThis.Deno.env.get = get;
      globalThis.Deno.env.set = set;
      globalThis.Deno.env.delete = del;
    },
    callback,
  );
}

async function withGlobalMock<T, O, M>(
  store: () => MaybePromise<O>,
  replace: () => MaybePromise<M>,
  restore: (original: O) => MaybePromise<void>,
  callback: (mock: M) => MaybePromise<T>,
) {
  const original = await store();
  const mock = await replace();

  try {
    return await callback(mock);
  } finally {
    await restore(original);
  }
}
