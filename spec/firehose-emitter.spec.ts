import { FirehoseSender } from "@/firehose-sender";

// Comment out this line if you want to really log something
// describe('firehoser module', () => {
describe.skip('firehoser module', () => {
  // Replace 'donkey' with a real stream name
  const FH = new FirehoseSender('donkey', {
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
      done();
    }, e => {
      console.log(e);
      done();
    });
  });
});
