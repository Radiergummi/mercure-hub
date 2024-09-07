export function generateId() {
  return `urn:uuid:${crypto.randomUUID()}` as const;
}

export type Update = {
  readonly id: string;
  readonly canonicalTopic: string;
  readonly alternateTopics: string[];
  readonly data?: string;
  readonly private?: boolean;
  readonly retry?: number;
  readonly type?: string;
};
