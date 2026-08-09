import {
  type FirehoseClient,
  PutRecordCommand,
  type PutRecordCommandOutput,
} from "@aws-sdk/client-firehose";

/** A destination for formatted log lines. Implement this to swap the real Firehose call out in tests. */
export interface MessageSender {
  send(message: string): Promise<unknown>;

  /** Sends anything held back and waits for it. Only senders that buffer implement this. */
  flush?(): Promise<void>;
}

/** Sends records to an AWS Kinesis Firehose delivery stream via the SDK v3 client. */
export class FirehoseSender implements MessageSender {
  constructor(
    private readonly streamName: string,
    private readonly client: FirehoseClient,
  ) {}

  async send(message: string): Promise<PutRecordCommandOutput> {
    const command = new PutRecordCommand({
      DeliveryStreamName: this.streamName,
      Record: { Data: Buffer.from(message) },
    });

    return this.client.send(command);
  }
}
