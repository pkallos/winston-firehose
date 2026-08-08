import { MESSAGE } from "triple-beam";
import Transport from "winston-transport";
import { FirehoseSender } from "./firehose-sender.js";
import type { MessageSender } from "./interfaces.js";
import {
  DefaultFormatter,
  type FirehoseTransportOptions,
  type FormatterFunc,
  type LogInfo,
} from "./types.js";

/**
 * Winston transport that pipes log messages into AWS Kinesis Firehose.
 *
 * @export
 * @class FirehoseTransport
 * @extends {Transport}
 */
export class FirehoseTransport extends Transport {
  private sender: MessageSender;
  private formatter?: FormatterFunc;
  name: string;
  private eol = "";

  /**
   * Creates an instance of FirehoseTransport.
   *
   * @param {FirehoseTransportOptions} options
   * @memberof FirehoseTransport
   */
  constructor(options: FirehoseTransportOptions) {
    super(options);
    this.name = "FirehoseLogger";

    if (!options.useLoggerLevel) {
      this.level = options.level ?? "info";
    }

    if (!options.useLoggerFormat) {
      this.formatter = options.formatter ?? DefaultFormatter;
    }

    if (options.eol !== undefined) {
      this.eol = options.eol;
    }

    const streamName = options.streamName;
    const firehoseOptions = options.firehoseOptions || {};

    this.sender = options.firehoseSender ?? new FirehoseSender(streamName, firehoseOptions);
  }

  log(info: LogInfo, callback: () => void): void {
    // Fire and forget so we don't back up the stream.
    if (callback) {
      setImmediate(callback);
    }

    let message = info[MESSAGE] as string;

    if (this.formatter) {
      message = this.formatter({ timestamp: new Date().toISOString(), ...info });
    }

    if (this.eol.length) {
      message += this.eol;
    }

    this.sender
      .send(message)
      .then(() => {
        this.emit("logged", message);
      })
      .catch((err: unknown) => {
        this.emit("error", err);
      });
  }
}
