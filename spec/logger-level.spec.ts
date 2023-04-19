import winston from 'winston';
import { MockSender } from './support/test-sender';
import { FirehoseTransport } from "@/firehose-transport";

describe('firehose logger transport level', function () {


  it('default level is info', function () {
    const mock = new MockSender();
    const message = "test message";
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message);
    expect(spy).toHaveBeenCalled();

    spy.mockClear();
    logger.debug(message);
    expect(spy).not.toHaveBeenCalled();
  });

  it('if option.level is defined, use the level', function () {
    const mock = new MockSender();
    const message = "test message";
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          level: 'warn',
        }),
      ],
    });

    logger.info(message);
    expect(spy).not.toHaveBeenCalled();

    logger.warn(message);
    expect(spy).toHaveBeenCalled();
  });

  it('if options.useLoggerLevel is true, use logger level', function () {
    const mock = new MockSender();
    const message = "test message";
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      level: 'warn',
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          useLoggerLevel: true,
        }),
      ],
    });

    logger.info(message);
    expect(spy).not.toHaveBeenCalled();

    logger.warn(message);
    expect(spy).toHaveBeenCalled();
  });

  it('if options.useLoggerLevel is false or undefined, ignore logger level', function () {
    const mock = new MockSender();
    const message = "test message";
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      level: 'warn',
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message);
    expect(spy).toHaveBeenCalled();
  });
});
