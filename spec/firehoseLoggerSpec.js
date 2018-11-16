const winston = require('winston');
const MockFireHoser = require('./support/mock-firehoser');
const WFireHose = require('../src/index.js');

describe('firehose logger transport', function () {
  beforeAll(function () {
    this.m = new MockFireHoser('test-stream', {});
    this.message = 'test message';
    spyOn(this.m, 'send').and.callThrough();
  });

  it('logs a message', function (done) {
    const { m, message } = this;
    m.send(message)
      .then(response => {
        expect(response).toBe(message);
        done();
      })
      .catch(done);
  });

  it('affixes to winston', function (done) {
    const { m, message } = this;
    m.send.calls.reset();
    const logger = winston.createLogger({
      transports: [
        new WFireHose({ firehoser: m }),
      ],
    });

    logger.info(message);
    expect(m.send).toHaveBeenCalled();
    done();
  });
});
