import { FirehoseTransport } from "@/firehose-transport";
import os from 'os';
import winston from 'winston';
import { MockSender } from "./support/test-sender";

describe('firehose logger transport', function () {

  it('defaults to EOL delimiter being empty', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    const expectedMessage = message;

    logger.info(message);
    const actualMessage = JSON.parse(spy.mock.calls[0][0]);
    expect(actualMessage.message).toBe(expectedMessage);
  });

  it('allows the user to set EOL delimiter to a single char', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          eol: '$',
        }),
      ],
    });

    logger.info(message);
    const param = spy.mock.calls[0][0];
    expect(param.endsWith('$')).toBe(true);

    const actualMessage = JSON.parse(param.slice(0, param.length - 1));
    expect(actualMessage.message).toBe(message);
  });

  it('allows the user to set EOL delimiter to a newline', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          eol: os.EOL,
        }),
      ],
    });

    logger.info(message);
    const param = spy.mock.calls[0][0];
    expect(param.endsWith(os.EOL)).toBe(true);

    const actualMessage = JSON.parse(param);
    expect(actualMessage.message).toBe(message);
  });

  it('allows the user to set EOL delimiter to a single char, with formatter', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          formatter: (info) => `formatted: ${info.level} ${info.message}`,
          eol: "$",
        }),
      ],
    });

    const expectedMessage = `formatted: info ${message}$`;

    logger.info(message);
    const actualMessage = spy.mock.calls[0][0];
    expect(actualMessage).toBe(expectedMessage);
  });

  it('if option.useLoggerFormat is defined, options.eol still works', function () {
    const mock = new MockSender();
    const message = 'test message';
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          useLoggerFormat: true,
          eol: os.EOL,
        }),
      ],
    });

    const expectedMessage = `info: ${message}` + os.EOL;

    logger.info(message);
    const actualMessage = spy.mock.calls[0][0];
    expect(actualMessage).toBe(expectedMessage);
  });

  it('if metadata is passed, options.eol still works', function () {
    const mock = new MockSender();
    const message = 'test message';
    const meta = { snakes: 'delicious' };
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
          eol: '$'
        }),
      ],
    });

    logger.info(message, meta);
    const param = spy.mock.calls[0][0];
    expect(param.endsWith('$')).toBe(true);

    const actualMessage = JSON.parse(param.slice(0, param.length - 1));
    expect(actualMessage.message).toBe(message);
    expect(actualMessage.snakes).toBe('delicious');
    expect(actualMessage.level).toBe('info');
    expect(actualMessage.timestamp).toBeDefined();
  });
});
