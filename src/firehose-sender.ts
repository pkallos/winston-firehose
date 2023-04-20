import { FirehoseClient, FirehoseClientConfig, PutRecordCommand, PutRecordCommandInput } from "@aws-sdk/client-firehose";
import { MessageSender } from './interfaces';


export class FirehoseSender implements MessageSender {
  private firehose: FirehoseClient;

  constructor(
    private streamName: string,
    private firehoseOptions: FirehoseClientConfig = {}
  ) {
    this.firehose = new FirehoseClient(firehoseOptions);
  }

  async send(message: string) {
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
