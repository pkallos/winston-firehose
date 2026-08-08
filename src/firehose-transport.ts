import { FirehoseClient, type FirehoseClientConfig } from "@aws-sdk/client-firehose";
import type { TransformableInfo } from "logform";
import { MESSAGE } from "triple-beam";
import Transport, { type TransportStreamOptions } from "winston-transport";
import { FirehoseSender, type MessageSender } from "@/firehose-sender.js";

export type FormatterFunc = (info: TransformableInfo) => string;

const jsonFormatter: FormatterFunc = (info) => JSON.stringify(info);
const loggerFormatter: FormatterFunc = (info) => info[MESSAGE] as string;

// `useLoggerFormat` wins over `formatter`: when it's set, the line winston already
// formatted is sent verbatim and any custom formatter is ignored.
function resolveFormatter(options: FirehoseTransportOptions): FormatterFunc {
  if (options.useLoggerFormat) return loggerFormatter;
  return options.formatter ?? jsonFormatter;
}

export type FirehoseTransportOptions = TransportStreamOptions & {
  /** Kinesis Data Firehose delivery stream name. */
  streamName: string;

  /**
   * If true, the transport inherits the logger's overall log level. Otherwise the
   * transport's own level is used, defaulting to `info`.
   */
  useLoggerLevel?: boolean;

  /**
   * If true, the transport sends the line winston's own formatter already produced,
   * ignoring `formatter`. Otherwise messages are formatted with `formatter`, or
   * `JSON.stringify` if none is given.
   */
  useLoggerFormat?: boolean;

  /** Custom formatter. Ignored when `useLoggerFormat` is set. */
  formatter?: FormatterFunc;

  /**
   * Options passed directly to the underlying `FirehoseClient` constructor, documented
   * {@link https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/interfaces/firehoseclientconfig.html | here}.
   * Ignored if `firehoseClient` is given.
   */
  firehoseOptions?: FirehoseClientConfig;

  /**
   * A preconfigured `FirehoseClient` to send records with, for consumers who need
   * custom credentials, middleware, or retry behavior. Takes precedence over
   * `firehoseOptions`.
   */
  firehoseClient?: FirehoseClient;

  /** End of line delimiter appended to each message. Defaults to `""`. */
  eol?: string;

  /** Test seam: overrides both `firehoseOptions` and `firehoseClient` entirely. */
  firehoseSender?: MessageSender;
};

/** Winston transport that sends log messages to an AWS Kinesis Firehose delivery stream. */
export class FirehoseTransport extends Transport {
  readonly name = "FirehoseLogger";
  private readonly sender: MessageSender;
  private readonly formatter: FormatterFunc;
  private readonly eol: string;

  constructor(options: FirehoseTransportOptions) {
    super(options);

    if (!options.useLoggerLevel) {
      this.level = options.level ?? "info";
    }

    this.formatter = resolveFormatter(options);
    this.eol = options.eol ?? "";

    const client = options.firehoseClient ?? new FirehoseClient(options.firehoseOptions ?? {});
    this.sender = options.firehoseSender ?? new FirehoseSender(options.streamName, client);
  }

  log(info: TransformableInfo, callback?: () => void): void {
    // fire and forget so the winston stream doesn't back up behind firehose
    if (callback) setImmediate(callback);

    const message = this.formatter({ timestamp: new Date().toISOString(), ...info }) + this.eol;

    this.sender.send(message).then(
      () => this.emit("logged", message),
      (err: unknown) => this.emit("error", err),
    );
  }
}
