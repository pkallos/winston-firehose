const Transport = require('winston-transport');
const AWS = require('aws-sdk');
const { MESSAGE } = require('triple-beam');

AWS.config.setPromisesDependency(Promise);

const IFireHoser = class IFireHoser {
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
};

const FireHoser = class FireHoser extends IFireHoser {
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
};

const FirehoseLogger = class FirehoseLogger extends Transport {
  constructor(options) {
    super(options);
    this.name = 'FirehoseLogger';
    if (!options.useLoggerLevel) {
      this.level = options.level || 'info';
    }
    if (!options.useLoggerFormat) {
      this.formatter = options.formatter || JSON.stringify;
    }

    const streamName = options.streamName;
    const firehoseOptions = options.firehoseOptions || {};
    if (firehoseOptions.region) {
      AWS.config.update({ region: firehoseOptions.region });
    }

    this.firehoser = options.firehoser || new FireHoser(streamName, firehoseOptions);
  }

  log(info, callback) {
    if (callback) {
      setImmediate(callback);
    }
    let message = info[MESSAGE];
    if (this.formatter) {
      message = Object.assign({ timestamp: (new Date()).toISOString() }, info);
      message = this.formatter(message);
    }
    return this.firehoser.send(message);
  }
};

module.exports = { IFireHoser, FireHoser, FirehoseLogger };
