import { MessageSender } from '@/interfaces';

export class MockSender implements MessageSender {
  send(message: string) {
    return Promise.resolve(message);
  }
}

