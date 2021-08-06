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
});
