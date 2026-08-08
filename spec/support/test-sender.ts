import type { MessageSender } from "@/firehose-sender.js";

export class MockSender implements MessageSender {
  send(message: string) {
    return Promise.resolve(message);
  }
}
