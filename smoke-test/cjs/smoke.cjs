const winston = require('winston');
const { FirehoseTransport } = require('winston-firehose');

if (typeof FirehoseTransport !== 'function') {
  throw new Error('FirehoseTransport did not load as a function via require()');
}

const transport = new FirehoseTransport({
  streamName: 'smoke-test-stream',
  firehoseSender: { send: (msg) => Promise.resolve(msg) },
  firehoseOptions: { region: 'us-east-1' },
});

const logger = winston.createLogger({ transports: [transport] });

transport.on('logged', (msg) => {
  console.log('CJS smoke OK:', msg);
  process.exit(0);
});
transport.on('error', (err) => {
  console.error('CJS smoke FAILED:', err);
  process.exit(1);
});

logger.info('cjs smoke message');
