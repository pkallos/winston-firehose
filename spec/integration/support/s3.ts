import { GetObjectCommand, paginateListObjectsV2, type S3Client } from "@aws-sdk/client-s3";
import type { DeliveredObject, DeliveredObjectReader, WaitOptions } from "./backend.js";

export interface S3DeliveryReaderOptions {
  readonly client: S3Client;
  readonly bucket: string;
  /** Firehose appends its own `YYYY/MM/DD/HH/` beneath this. */
  readonly prefix: string;
  /** Objects older than this (less clock-skew slack) belong to an earlier run. */
  readonly since: Date;
}

const DEFAULT_TIMEOUT_MS = 60_000;
/** Firehose with zero buffering still takes ~5s, so the first list is otherwise empty. */
const DEFAULT_INITIAL_DELAY_MS = 3_000;
/** Flat, not backed off: delivery latency here is a known constant, not an unknown. */
const DEFAULT_INTERVAL_MS = 1_000;
const CLOCK_SKEW_SLACK_MS = 60_000;
const DIAGNOSTIC_BODY_CHARS = 500;
const DIAGNOSTIC_NEEDLE_CHARS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}... (${value.length} chars)`;
}

export function createS3DeliveryReader(options: S3DeliveryReaderOptions): DeliveredObjectReader {
  const { client, bucket, prefix, since } = options;
  const cutoff = since.getTime() - CLOCK_SKEW_SLACK_MS;
  // S3 objects are immutable once written, so a body is only ever fetched once.
  const bodies = new Map<string, string>();

  async function readNewObjects(): Promise<void> {
    const pages = paginateListObjectsV2({ client }, { Bucket: bucket, Prefix: prefix });

    for await (const page of pages) {
      for (const object of page.Contents ?? []) {
        const key = object.Key;
        if (!key || bodies.has(key)) continue;
        if (object.LastModified && object.LastModified.getTime() < cutoff) continue;

        const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        bodies.set(key, (await got.Body?.transformToString("utf-8")) ?? "");
      }
    }
  }

  function findObjectContaining(text: string): DeliveredObject | undefined {
    for (const [key, body] of bodies) {
      if (body.includes(text)) return { key, body };
    }
    return undefined;
  }

  function timeoutError(text: string, elapsedMs: number): Error {
    const seen = [...bodies].map(
      ([key, body]) =>
        `  - ${key} (${Buffer.byteLength(body, "utf-8")} bytes): ` +
        truncate(body, DIAGNOSTIC_BODY_CHARS),
    );

    return new Error(
      [
        `no delivered object contained ${JSON.stringify(truncate(text, DIAGNOSTIC_NEEDLE_CHARS))}`,
        `  bucket: ${bucket}`,
        `  prefix: ${prefix}`,
        `  elapsed: ${elapsedMs}ms`,
        `  objects seen: ${bodies.size}`,
        ...seen,
      ].join("\n"),
    );
  }

  return {
    async waitForObjectContaining(
      text: string,
      waitOptions: WaitOptions = {},
    ): Promise<DeliveredObject> {
      const timeoutMs = waitOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const initialDelayMs = waitOptions.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
      const intervalMs = waitOptions.intervalMs ?? DEFAULT_INTERVAL_MS;
      const startedAt = Date.now();
      const deadline = startedAt + timeoutMs;

      await sleep(initialDelayMs);

      for (;;) {
        await readNewObjects();

        const found = findObjectContaining(text);
        if (found) return found;

        if (Date.now() >= deadline) throw timeoutError(text, Date.now() - startedAt);
        await sleep(intervalMs);
      }
    },
  };
}
