export interface MessageSender {
  send(message: string): Promise<unknown>;
}
