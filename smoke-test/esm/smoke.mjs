import winston from 'winston';
import { FirehoseTransport } from 'winston-firehose';

if (typeof FirehoseTransport !== 'function') {
  throw new Error('FirehoseTransport did not load as a function via import');
}

const transport = new FirehoseTransport({
  streamName: 'smoke-test-stream',
  firehoseSender: { send: (msg) => Promise.resolve(msg) },
  firehoseOptions: { region: 'us-east-1' },
});

const logger = winston.createLogger({ transports: [transport] });

await new Promise((resolve, reject) => {
  transport.on('logged', (msg) => {
    console.log('ESM smoke OK:', msg);
    resolve();
  });
  transport.on('error', reject);
  logger.info('esm smoke message');
});
