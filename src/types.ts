import type { FirehoseClientConfig } from '@aws-sdk/client-firehose';
import type { TransportStreamOptions } from 'winston-transport';
import type { MessageSender } from './interfaces.js';

/**
 * A winston log record as it reaches a transport. Winston stashes the fully
 * formatted line under the `MESSAGE` symbol from `triple-beam`, so the index
 * signature has to cover symbol keys too.
 */
export type LogInfo = {
  level: string;
  message: unknown;
  [key: string]: unknown;
  [key: symbol]: unknown;
};

export type FormatterFunc = (message: LogInfo) => string;

export const DefaultFormatter: FormatterFunc = (message) => JSON.stringify(message);

export type FirehoseTransportOptions = TransportStreamOptions & {
  /**
   * Kinesis delivery stream name.
   *
   * @type {string}
   */
  streamName: string;

  /**
   * If set to true, the Kinesis Transport logger stream will inherit the logger's
   * overall log level. Otherwise the log level will default to 'info'.
   *
   * @type {boolean}
   */
  useLoggerLevel?: boolean;

  /**
   * If set to true, the Kinesis Transport log format will be inherited from the
   * overall logger's format specifcation. Otherwise, the log formatter will default
   * to JSON.stringify, and appends a timestamp.
   *
   * This option overrides any value for a provided `formatter` option.
   *
   * @type {boolean}
   */
  useLoggerFormat?: boolean;

  /**
   * Specify a custom formatter function. This overrides the behavior
   * of useLoggerFormat.
   *
   * @type {FormatterFunc}
   */
  formatter?: FormatterFunc;

  /**
   * Passes through these parameters directly to the Amazon AWS Firehose SDK.
   * These options are documented {@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Firehose.html#constructor-property | here}.
   *
   * @type {FirehoseClientConfig}
   */
  firehoseOptions?: FirehoseClientConfig;

  /**
   * Optional end of line delimiter when passing messages to AWS Fireshose.
   * Defaults to `""`.
   *
   * @type {string}
   */
  eol?: string;

  /**
   * Injector parameter for mocking and testing.
   *
   * @private
   */
  firehoseSender?: MessageSender;
};
