const winston = require('winston');
const MockFireHoser = require('./support/mock-firehoser');
const WFireHose = require('../src/index.js');

describe('firehose logger transport', function () {
  let mockFirehoser;
  const message = 'test message';

  beforeEach(function () {
    jasmine.clock().mockDate(new Date('Fri Aug 06 2021 15:17:28 GMT-0400 (Eastern Daylight Time)'));

    mockFirehoser = new MockFireHoser('test-stream', {});
    spyOn(mockFirehoser, 'send').and.callThrough();
  });

  it('logs a message', function (done) {
    mockFirehoser.send(message)
      .then(response => {
        expect(response).toBe(message);
        done();
      })
      .catch(done);
  });

  it('affixes to winston', function () {
    const logger = winston.createLogger({
      transports: [
        new WFireHose({ firehoser: mockFirehoser }),
      ],
    });

    logger.info(message);

    expect(mockFirehoser.send).toHaveBeenCalled();
  });

  it('sends a message', function () {
    const firehose = new WFireHose({ firehoser: mockFirehoser });
    const logger = winston.createLogger({
      transports: [firehose],
    });

    logger.info(message);

    expect(mockFirehoser.send).toHaveBeenCalledWith(
      '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}'
    );
  });

  it('emits a "logged" event', function (done) {
    const firehose = new WFireHose({ firehoser: mockFirehoser });
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
    mockFirehoser.send.and.returnValue(Promise.reject(new Error('send failure')));

    const firehose = new WFireHose({ firehoser: mockFirehoser });
    const logger = winston.createLogger({
      transports: [firehose],
    });

    logger.on('error', (err) => {
      expect(err).toEqual(new Error('send failure'));
      done();
    });

    logger.info(message);
  });
});
