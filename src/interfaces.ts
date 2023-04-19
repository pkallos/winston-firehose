export interface MessageSender {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(message: string): Promise<any>;
}
