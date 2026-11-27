export type Unsubscribe = () => void;

/** One owner, asynchronous delivery, sticky close. See DESIGN 5.6.5. */
export interface Transport {
  send(message: object): void;
  onMessage(handler: (message: unknown) => void): Unsubscribe;
  onClose(handler: (cause?: Error) => void): Unsubscribe;
  close(): void;
}
