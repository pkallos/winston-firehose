const fh = require('../src/firehose.js');

describe('firehoser module', () => {
  // pending('comment out this line if you want to really log something');
  // Replace 'donkey' with a real stream name
  const FH = new fh.FireHoser('donkey', {
    region: 'us-east-1',
  });

  it('writes to firehose', done => {
    const message = {
      timestamp: (new Date()).toISOString(),
      level: 'info',
      message: 'test message',
      meta: { rich: 'meta' },
    };
    FH.send(JSON.stringify(message)).then(m => {
      console.log(m);
      done(m);
    }, e => {
      console.log(e);
      done(new Error('fudge'));
    });
  });
});
