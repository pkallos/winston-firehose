const winston = require('winston');
const AWS = require('aws-sdk');
const Promise = require('bluebird');

AWS.config.setPromisesDependency(Promise);

export class IFireHoser {
  // eslint-disable-next-line no-useless-constructor, no-unused-vars
  constructor(streamName, firehoseOptions) {
    // new.target doesn't work with babel and nodejs <= 4.0.0
    // so leaving this out for now
    // if (new.target === IFireHoser) {
    //  throw new TypeError('Cannot construct Abstract instances directly');
    // }
  }

  /**
   * @returns Promise containing the recordId
   */
  send(message) { // eslint-disable-line no-unused-vars
    throw new Error('Not Implemented.');
  }
}

export class FireHoser extends IFireHoser {
  constructor(streamName, firehoseOptions) {
    super(streamName, firehoseOptions);
    this.streamName = streamName;
    this.firehose = new AWS.Firehose(firehoseOptions || {});
  }

  /**
   * @returns Promise
   */
  send(message) {
    const params = {
      DeliveryStreamName: this.streamName,
      Record: {
        Data: message,
      },
    };

    return this.firehose.putRecord(params).promise();
  }
}

export class FirehoseLogger extends winston.Transport {
  constructor(options) {
    super(options);
    this.name = 'FirehoseLogger';
    this.level = options.level || 'info';

    const streamName = options.streamName;
    const firehoseOptions = options.firehoseOptions || {};

    this.firehoser = options.firehoser || new FireHoser(streamName, firehoseOptions);
  }

  log(level, msg, meta, callback) {
    const message = {
      timestamp: (new Date()).toISOString(),
      level,
      message: msg,
      meta,
    };

    return this.firehoser.send(JSON.stringify(message)).then(
      () => callback(null, true),
      e => {
        callback(e, false);
        throw new Error(e);
      });
  }
}
