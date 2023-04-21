import { FirehoseClientConfig } from "@aws-sdk/client-firehose";
import { TransportStreamOptions } from "winston-transport";
import { MessageSender } from "./interfaces";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormatterFunc = (message: any) => string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DefaultFormatter: FormatterFunc = (message: any) => JSON.stringify(message);


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
}
