import { vi } from 'vitest';
import winston from 'winston';
import { FirehoseTransport } from '@/firehose-transport';
import { MockSender } from './support/test-sender';

describe('firehose logger transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('Fri Aug 06 2021 15:17:28 GMT-0400 (Eastern Daylight Time)'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs a message', async () => {
    const mock = new MockSender();
    const message = 'test message';

    await expect(mock.send(message)).resolves.toBe(message);
  });

  it('affixes to winston', () => {
    const mock = new MockSender();
    const message = 'test message';
    const spy = vi.spyOn(mock, 'send');

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
  });

  it('sends a message', () => {
    const mock = new MockSender();
    const message = 'test message';
    const spy = vi.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message);

    expect(spy).toHaveBeenCalledWith(
      '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}',
    );
  });

  it('emits a "logged" event', async () => {
    const mock = new MockSender();
    const message = 'test message';

    const firehose = new FirehoseTransport({
      streamName: 'test',
      firehoseSender: mock,
    });

    const logger = winston.createLogger({
      transports: [firehose],
    });

    const logged = new Promise<void>((resolve) => {
      firehose.on('logged', (loggedMessage) => {
        expect(loggedMessage).toEqual(
          '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}',
        );
        resolve();
      });
    });

    logger.info(message);

    await logged;
  });

  it('emits an "error" event', async () => {
    const mock = new MockSender();
    const message = 'test message';

    vi.spyOn(mock, 'send').mockReturnValue(Promise.reject(new Error('send failure')));

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        }),
      ],
    });

    const errored = new Promise<void>((resolve) => {
      logger.on('error', (err) => {
        expect(err).toEqual(new Error('send failure'));
        resolve();
      });
    });

    logger.info(message);

    await errored;
  });
});
