import {
  FirehoseClient,
  type FirehoseClientConfig,
  PutRecordCommand,
  type PutRecordCommandInput,
  type PutRecordCommandOutput,
} from "@aws-sdk/client-firehose";
import type { MessageSender } from "@/interfaces.js";

/**
 * Sender implementation that pipes records into AWS Kinesis Firehose
 *
 * @export
 * @class FirehoseSender
 * @implements {MessageSender}
 */
export class FirehoseSender implements MessageSender {
  private firehose: FirehoseClient;

  constructor(
    private streamName: string,
    firehoseOptions: FirehoseClientConfig = {},
  ) {
    this.firehose = new FirehoseClient(firehoseOptions);
  }

  async send(message: string): Promise<PutRecordCommandOutput> {
    const params: PutRecordCommandInput = {
      DeliveryStreamName: this.streamName,
      Record: {
        Data: Buffer.from(message),
      },
    };

    const command = new PutRecordCommand(params);

    return this.firehose.send(command);
  }
}
