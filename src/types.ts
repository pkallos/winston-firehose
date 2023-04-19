import { Firehose } from "aws-sdk";
import { TransportStreamOptions } from "winston-transport";
import { MessageSender } from "./interfaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormatterFunc = (message: any) => string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DefaultFormatter: FormatterFunc = (message: any) => JSON.stringify(message);

export type FirehoseTransportOptions = TransportStreamOptions & {
  useLoggerLevel?: boolean;
  useLoggerFormat?: boolean;
  formatter?: FormatterFunc;
  streamName: string;
  firehoseOptions?: Firehose.ClientConfiguration;
  firehoseSender?: MessageSender;
}
