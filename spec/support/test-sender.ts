import type { MessageSender } from "@/interfaces.js";

export class MockSender implements MessageSender {
  send(message: string) {
    return Promise.resolve(message);
  }
}
