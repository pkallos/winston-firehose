import { makeLogger } from "./support/harness.js";

describe("firehose logger transport level", () => {
  it("default level is info", () => {
    const { logger, sent } = makeLogger();

    logger.info("test message");
    expect(sent.length).toBe(1);

    logger.debug("test message");
    expect(sent.length).toBe(1);
  });

  it("if option.level is defined, use the level", () => {
    const { logger, sent } = makeLogger({ level: "warn" });

    logger.info("test message");
    expect(sent.length).toBe(0);

    logger.warn("test message");
    expect(sent.length).toBe(1);
  });

  it("if options.useLoggerLevel is true, use logger level", () => {
    const { logger, sent } = makeLogger({ useLoggerLevel: true }, { level: "warn" });

    logger.info("test message");
    expect(sent.length).toBe(0);

    logger.warn("test message");
    expect(sent.length).toBe(1);
  });

  it("if options.useLoggerLevel is false or undefined, ignore logger level", () => {
    const { logger, sent } = makeLogger({}, { level: "warn" });

    logger.info("test message");
    expect(sent.length).toBe(1);
  });
});
