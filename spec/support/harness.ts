import winston from "winston";
import type { MessageSender } from "@/firehose-sender.js";
import { FirehoseTransport, type FirehoseTransportOptions } from "@/firehose-transport.js";

/** A `MessageSender` that records every message instead of sending it anywhere. */
export class RecordingSender implements MessageSender {
  readonly sent: string[] = [];
  private failure?: Error;

  send(message: string): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    this.sent.push(message);
    return Promise.resolve(message);
  }

  /** Makes every subsequent `send` reject with `error`, instead of recording it. */
  failNext(error: Error): void {
    this.failure = error;
  }

  /** Undoes `failNext`, so sends are recorded again. */
  recover(): void {
    this.failure = undefined;
  }
}

/**
 * Builds a winston logger wired to a `FirehoseTransport` backed by a `RecordingSender`.
 * `transportOptions` override the transport defaults (`streamName: "test"`);
 * `loggerOptions` are passed to `winston.createLogger` alongside the transport.
 */
export function makeLogger(
  transportOptions: Partial<FirehoseTransportOptions> = {},
  loggerOptions: Partial<winston.LoggerOptions> = {},
) {
  const sender = new RecordingSender();
  const transport = new FirehoseTransport({
    streamName: "test",
    firehoseSender: sender,
    ...transportOptions,
  });
  const logger = winston.createLogger({ ...loggerOptions, transports: [transport] });

  return { logger, transport, sender, sent: sender.sent };
}
