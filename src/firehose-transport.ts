
import { MESSAGE } from 'triple-beam';
import Transport from 'winston-transport';
import { FirehoseSender } from './firehose-sender';
import { MessageSender } from './interfaces';
import { DefaultFormatter, FirehoseTransportOptions, FormatterFunc } from './types';


export class FirehoseTransport extends Transport {
  private sender: MessageSender;
  private formatter?: FormatterFunc;
  private name: string;

  constructor(options: FirehoseTransportOptions) {
    super(options);
    this.name = "FirehoseLogger";

    if (!options.useLoggerLevel) {
      this.level = options.level ?? 'info';
    }

    if (!options.useLoggerFormat) {
      this.formatter = options.formatter ?? DefaultFormatter;
    }

    const streamName = options.streamName;
    const firehoseOptions = options.firehoseOptions || {};

    this.sender = options.firehoseSender ?? new FirehoseSender(streamName, firehoseOptions);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(info: any, callback: () => void) {
    // Fire and forget so we don't back up the stream.
    if (callback) {
      setImmediate(callback);
    }
    let message = info[MESSAGE];
    if (this.formatter) {
      message = Object.assign({ timestamp: (new Date()).toISOString() }, info);
      message = this.formatter(message);
    }
    this.sender
      .send(message)
      .then(() => {
        this.emit('logged', message);
      })
      .catch((err) => {
        this.emit('error', err);
      });
  }
}
