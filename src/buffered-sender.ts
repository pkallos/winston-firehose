import type { MessageSender } from "@/firehose-sender.js";

/**
 * Firehose {@link https://aws.amazon.com/kinesis/data-firehose/pricing/ | bills a record in
 * 5 KB increments}, so filling one to 5 KB is where the saving is. Past that there's none
 * left to take, only more messages to lose if the process dies.
 */
const DEFAULT_BUFFER_SIZE_KB = 5;

/**
 * Firehose de-aggregates at most 500 records out of one blob, so a fuller record would
 * break a consumer that relies on it.
 * @see {@link https://docs.aws.amazon.com/firehose/latest/APIReference/API_PutRecord.html}
 */
const DEFAULT_BUFFER_SIZE = 500;

const DEFAULT_FLUSH_TIMEOUT = 30_000;

/**
 * Firehose rejects a record whose data blob exceeds 1,000 KiB.
 * @see {@link https://docs.aws.amazon.com/firehose/latest/APIReference/API_PutRecord.html}
 */
const MAX_RECORD_SIZE_KB = 1_000;

const BYTES_PER_KB = 1_024;

export type BufferingOptions = {
  /** Messages to hold before sending a record. Defaults to `500`. */
  bufferSize?: number;

  /**
   * Buffered bytes to hold before sending a record, in KiB. Defaults to `5`, the increment
   * Firehose bills in; `1000` is the largest record it accepts.
   */
  bufferSizeKb?: number;

  /** Milliseconds a partial record waits before being sent anyway. Defaults to `30000`. */
  flushTimeout?: number;
};

function positive(label: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be greater than 0, got ${value}`);
  }
  return value;
}

type Buffered = {
  readonly message: string;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: unknown) => void;
};

/**
 * Concatenates messages into one Firehose record before handing them to `sender`,
 * so a run of small log lines is billed as one record instead of one each.
 *
 * A record is its messages joined end to end, byte for byte what separate records
 * deliver, so splitting them apart downstream depends on the transport's `eol`.
 */
export class BufferedSender implements MessageSender {
  private readonly maxMessages: number;
  private readonly maxBytes: number;
  private readonly flushTimeout: number;
  private buffer: Buffered[] = [];
  private bufferedBytes = 0;
  private timer?: NodeJS.Timeout;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sender: MessageSender,
    options: BufferingOptions,
  ) {
    this.maxMessages = positive("bufferSize", options.bufferSize ?? DEFAULT_BUFFER_SIZE);
    this.flushTimeout = positive("flushTimeout", options.flushTimeout ?? DEFAULT_FLUSH_TIMEOUT);

    const sizeKb = positive("bufferSizeKb", options.bufferSizeKb ?? DEFAULT_BUFFER_SIZE_KB);
    if (sizeKb > MAX_RECORD_SIZE_KB) {
      throw new RangeError(
        `bufferSizeKb must be at most ${MAX_RECORD_SIZE_KB}, the largest record firehose accepts, got ${sizeKb}`,
      );
    }
    this.maxBytes = sizeKb * BYTES_PER_KB;
  }

  /** Resolves once the record holding `message` has been sent, not when it's buffered. */
  send(message: string): Promise<unknown> {
    const bytes = Buffer.byteLength(message);
    if (this.buffer.length > 0 && this.bufferedBytes + bytes > this.maxBytes) {
      this.sendRecord();
    }

    const sent = new Promise<unknown>((resolve, reject) => {
      this.buffer.push({ message, resolve, reject });
    });
    this.bufferedBytes += bytes;

    if (this.buffer.length === 1) this.startTimer();
    if (this.buffer.length >= this.maxMessages || this.bufferedBytes >= this.maxBytes) {
      this.sendRecord();
    }

    return sent;
  }

  /**
   * Sends whatever is buffered and waits for every record still in flight. Resolves
   * whether or not those records made it: a failure reaches the caller through the
   * `send` promise of each message it carried.
   */
  async flush(): Promise<void> {
    this.sendRecord();
    await this.inFlight.catch(() => {});
  }

  private sendRecord(): void {
    this.clearTimer();
    if (this.buffer.length === 0) return;

    const record = this.buffer;
    this.buffer = [];
    this.bufferedBytes = 0;
    const data = record.map((entry) => entry.message).join("");

    // Chained rather than sent concurrently, so records reach the stream in the order
    // they were buffered even when one send is slow.
    const sent = this.inFlight.then(
      () => this.sender.send(data),
      () => this.sender.send(data),
    );
    this.inFlight = sent;

    sent.then(
      (result) => {
        for (const entry of record) entry.resolve(result);
      },
      (error: unknown) => {
        for (const entry of record) entry.reject(error);
      },
    );
  }

  private startTimer(): void {
    this.timer = setTimeout(() => this.sendRecord(), this.flushTimeout);
    // Never let a partial record hold the process open.
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
