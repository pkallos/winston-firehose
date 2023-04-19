import winston from 'winston';
import { FirehoseTransport } from "@/firehose-transport";
import { MockSender } from "./support/test-sender";

describe('firehose logger transport formatter', function () {

  it('default formatter is JSON.stringify', function () {
    const mock = new MockSender();
    const message = 'test message';
    const meta = { snakes: 'delicious' };
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message, meta);
    const actualMessage = JSON.parse(spy.mock.calls[0][0]);
    expect(actualMessage.message).toBe(message);
    expect(actualMessage.snakes).toBe('delicious');
    expect(actualMessage.level).toBe('info');
    expect(actualMessage.timestamp).toBeDefined();
  });

  it('if option.formatter is defined, use the formatter', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          formatter: (info) => `formatted: ${info.message}`,
        }),
      ],
    });

    logger.info(message);
    const actualMessage = spy.mock.calls[0][0];
    expect(actualMessage).toBe(`formatted: ${message}`);
  });

  it('ignore logger format by default', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message);
    const actualMessage = JSON.parse(spy.mock.calls[0][0]);
    expect(actualMessage.message).toBe(message);
  });

  it('if option.useLoggerFormat is defined, use the winston formatter (logger)', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          useLoggerFormat: true
        }),
      ],
    });

    logger.info(message);
    const actualMessage = spy.mock.calls[0][0];
    expect(actualMessage).toBe(`info: ${message}`);
  });

  it('if option.useLoggerFormat is defined, use the winston formatter (transport)', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          format: winston.format.simple(),
          useLoggerFormat: true
        }),
      ],
    });

    logger.info(message);
    const actualMessage = spy.mock.calls[0][0];
    expect(actualMessage).toBe(`info: ${message}`);
  });
});
