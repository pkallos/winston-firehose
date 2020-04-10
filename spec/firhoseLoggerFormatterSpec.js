const winston = require('winston');
const MockFireHoser = require('./support/mock-firehoser');
const WFireHose = require('../src/index.js');

describe('firehose logger transport formatter', function () {
  beforeAll(function () {
    this.m = new MockFireHoser('test-stream', {});
    this.message = 'test message';
    this.meta = { snakes: 'delicious' };
    spyOn(this.m, 'send').and.callThrough();
  });

  beforeEach(function () {
    this.m.send.calls.reset();
  });

  it('default formatter is JSON.stringify', function () {
    const { m, message, meta } = this;
    const logger = winston.createLogger({
      transports: [
        new WFireHose({
          firehoser: m,
        }),
      ],
    });

    logger.info(message, meta);
    const actualMessage = JSON.parse(m.send.calls.argsFor(0)[0]);
    expect(actualMessage.message).toBe(message);
    expect(actualMessage.snakes).toBe('delicious');
    expect(actualMessage.level).toBe('info');
    expect(actualMessage.timestamp).toBeDefined();
  });

  it('if option.formatter is defined, use the formatter', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      transports: [
        new WFireHose({
          firehoser: m,
          formatter: (info) => `formatted: ${info.message}`,
        }),
      ],
    });

    logger.info(message);
    const actualMessage = m.send.calls.argsFor(0)[0];
    expect(actualMessage).toBe(`formatted: ${message}`);
  });

  it('ignore logger format by default', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new WFireHose({
          firehoser: m,
        }),
      ],
    });

    logger.info(message);
    const actualMessage = JSON.parse(m.send.calls.argsFor(0)[0]);
    expect(actualMessage.message).toBe(message);
  });

  it('if option.useLoggerFormat is defined, use the winston formatter(logger)', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new WFireHose({
          firehoser: m,
          useLoggerFormat: true,
        }),
      ],
    });

    logger.info(message);
    const actualMessage = m.send.calls.argsFor(0)[0];
    expect(actualMessage).toBe(`info: ${message}`);
  });

  it('if option.useLoggerFormat is defined, use the winston formatter(transport)', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      transports: [
        new WFireHose({
          firehoser: m,
          useLoggerFormat: true,
          format: winston.format.simple(),
        }),
      ],
    });

    logger.info(message);
    const actualMessage = m.send.calls.argsFor(0)[0];
    expect(actualMessage).toBe(`info: ${message}`);
  });
});
