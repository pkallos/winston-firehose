const fh = require('../../src/firehose');

class MockFireHoser extends fh.IFireHoser {
  constructor(streamName, firehoseOptions) {
    super(streamName, firehoseOptions);
    this.streamName = streamName;
  }

  send(message) {
    return Promise.resolve(message);
  }
}

module.exports = MockFireHoser;
