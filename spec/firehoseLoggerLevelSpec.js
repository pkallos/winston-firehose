const winston = require('winston');
const MockFireHoser = require('./support/mock-firehoser');
const WFireHose = require('../src/index.js');

describe('firehose logger transport level', function () {
  beforeAll(function () {
    this.m = new MockFireHoser('test-stream', {});
    this.message = 'test message';
    spyOn(this.m, 'send').and.callThrough();
  });

  beforeEach(function () {
    this.m.send.calls.reset();
  });

  it('default level is info', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      transports: [
        new WFireHose({
          firehoser: m,
        }),
      ],
    });

    logger.info(message);
    expect(m.send).toHaveBeenCalled();

    this.m.send.calls.reset();
    logger.debug(message);
    expect(m.send).not.toHaveBeenCalled();
  });

  it('if option.level is defined, use the level', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      transports: [
        new WFireHose({
          firehoser: m,
          level: 'warn',
        }),
      ],
    });

    logger.info(message);
    expect(m.send).not.toHaveBeenCalled();

    logger.warn(message);
    expect(m.send).toHaveBeenCalled();
  });

  it('if options.useLoggerLevel is true, use logger level', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      level: 'warn',
      transports: [
        new WFireHose({
          firehoser: m,
          useLoggerLevel: true,
        }),
      ],
    });

    logger.info(message);
    expect(m.send).not.toHaveBeenCalled();

    logger.warn(message);
    expect(m.send).toHaveBeenCalled();
  });

  it('if options.useLoggerLevel is false or undefined, ignore logger level', function () {
    const { m, message } = this;
    const logger = winston.createLogger({
      level: 'warn',
      transports: [
        new WFireHose({
          firehoser: m,
        }),
      ],
    });

    logger.info(message);
    expect(m.send).toHaveBeenCalled();
  });
});
