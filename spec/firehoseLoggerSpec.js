const winston = require('winston');
const MockFireHoser = require('./support/mock-firehoser');
const WFireHose = require('../src/index.js');

describe("firehose logger transport", function() {
  const m = new MockFireHoser("test-stream", {});
  const message = "test message";

  it("logs a message", function(done) {

    m.send(message)
      .then(m => {
        expect(m).toBe(message);
        done();
      })
      .catch(e => done(e));
  });

  it("affixes to winston", function(done) {

    const logger = new (winston.Logger)({
      transports: [
        new (WFireHose)({ 'firehoser': m })
      ]
    });

    logger.info(message, function(err, level, m) {
      if (err) return done(err);

      expect(m).toBe(message);
      done();
    });
  });
});