import { Firehose } from 'aws-sdk';
import { MessageSender } from './interfaces';
import AWS from 'aws-sdk';

AWS.config.setPromisesDependency(Promise);

export class FirehoseSender implements MessageSender {
  private firehose: Firehose;

  constructor(
    private streamName: string,
    private firehoseOptions: Firehose.ClientConfiguration = {}
  ) {
    this.firehose = new Firehose(firehoseOptions);
  }

  async send(message: string) {
    const params: Firehose.PutRecordInput = {
      DeliveryStreamName: this.streamName,
      Record: {
        Data: message,
      },
    };

    return this.firehose.putRecord(params).promise();
  }
}
