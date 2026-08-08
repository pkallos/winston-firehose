import winston = require('winston');
import { FirehoseTransport, FirehoseTransportOptions } from 'winston-firehose';

const opts: FirehoseTransportOptions = { streamName: 'x' };
const t = new FirehoseTransport(opts);
const logger = winston.createLogger({ transports: [t] });
logger.info('typecheck cjs');
