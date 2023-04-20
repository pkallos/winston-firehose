import { FirehoseTransport } from "@/firehose-transport";
import winston from "winston";
import { MockSender } from "../spec/support/test-sender";

describe('firehose logger transport', function () {

  beforeEach(function () {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('Fri Aug 06 2021 15:17:28 GMT-0400 (Eastern Daylight Time)'));
  });

  it('logs a message', function (done) {
    const mock = new MockSender();
    const message = "test message";

    mock.send(message)
      .then(response => {
        expect(response).toBe(message);
        done();
      })
      .catch(done);
  });

  it('affixes to winston', function () {
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
  });

  it('sends a message', function () {
    const mock = new MockSender();
    const message = "test message";
    const spy = jest.spyOn(mock, 'send');

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        })
      ],
    });

    logger.info(message);

    expect(spy).toHaveBeenCalledWith(
      '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}'
    );
  });

  it('emits a "logged" event', function (done) {
    const mock = new MockSender();
    const message = "test message";

    const firehose = new FirehoseTransport({
      streamName: 'test',
      firehoseSender: mock,
    });

    const logger = winston.createLogger({
      transports: [firehose],
    });

    firehose.on('logged', (loggedMessage) => {
      expect(loggedMessage).toEqual(
        '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}'
      );
      done();
    });

    logger.info(message);
  });

  it('emits an "error" event', function (done) {
    const mock = new MockSender();
    const message = "test message";

    jest.spyOn(mock, 'send').mockReturnValue(Promise.reject(new Error('send failure')));

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: 'test',
          firehoseSender: mock,
        })
      ],
    });

    logger.on('error', (err) => {
      expect(err).toEqual(new Error('send failure'));
      done();
    });

    logger.info(message);
  });
});
