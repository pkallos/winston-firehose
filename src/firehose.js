const util = require('util');
const winston = require('winston');
const AWS = require('aws-sdk');
const Promise = require('bluebird');

AWS.config.setPromisesDependency(Promise);

export class IFireHoser {
  constructor(streamName, firehoseOptions) {
    if (new.target === IFireHoser) {
      throw new TypeError("Cannot construct Abstract instances directly");
    }
  }

  /**
   * @returns Promise containing the recordId
   */
  send(message) {
    throw new Error("Not Implemented.");
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
        Data: message
      }
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
    const firehoseOptions = this.firehoseOptions || {};

    this.firehoser = options.firehoser || new FireHoser(streamName, firehoseOptions);
  }

  log(level, msg, meta, callback) {
    const message = {
      timestamp: (new Date()).toISOString(),
      level: level,
      message: msg,
      meta: meta
    };

    this.firehoser.send(JSON.stringify(message));

    callback(null, true);
  }
}