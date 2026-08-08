import { makeLogger } from "./support/harness.js";

describe("firehose logger transport events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("Fri Aug 06 2021 15:17:28 GMT-0400 (Eastern Daylight Time)"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a message", () => {
    const { logger, sent } = makeLogger();

    logger.info("test message");

    expect(sent[0]).toBe(
      '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}',
    );
  });

  it('emits a "logged" event with the sent message', async () => {
    const { logger, transport } = makeLogger();

    const logged = new Promise<string>((resolve) => {
      transport.on("logged", resolve);
    });

    logger.info("test message");

    await expect(logged).resolves.toBe(
      '{"timestamp":"2021-08-06T19:17:28.000Z","message":"test message","level":"info"}',
    );
  });

  it('emits an "error" event when the sender rejects', async () => {
    const { logger, sender } = makeLogger();
    sender.failNext(new Error("send failure"));

    const errored = new Promise<Error>((resolve) => {
      logger.on("error", resolve);
    });

    logger.info("test message");

    await expect(errored).resolves.toEqual(new Error("send failure"));
  });
});
