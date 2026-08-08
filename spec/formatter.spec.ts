import winston from "winston";
import { makeLogger } from "./support/harness.js";

describe("firehose logger transport formatter", () => {
  it("default formatter is JSON.stringify", () => {
    const { logger, sent } = makeLogger();

    logger.info("test message", { snakes: "delicious" });
    const actualMessage = JSON.parse(sent[0]);
    expect(actualMessage.message).toBe("test message");
    expect(actualMessage.snakes).toBe("delicious");
    expect(actualMessage.level).toBe("info");
    expect(actualMessage.timestamp).toBeDefined();
  });

  it("if option.formatter is defined, use the formatter", () => {
    const { logger, sent } = makeLogger({
      formatter: (info) => `formatted: ${info.message}`,
    });

    logger.info("test message");
    expect(sent[0]).toBe("formatted: test message");
  });

  it("ignore logger format by default", () => {
    const { logger, sent } = makeLogger({}, { format: winston.format.simple() });

    logger.info("test message");
    const actualMessage = JSON.parse(sent[0]);
    expect(actualMessage.message).toBe("test message");
  });

  it("if option.useLoggerFormat is defined, use the winston formatter (logger)", () => {
    const { logger, sent } = makeLogger(
      { useLoggerFormat: true },
      { format: winston.format.simple() },
    );

    logger.info("test message");
    expect(sent[0]).toBe("info: test message");
  });

  it("if option.useLoggerFormat is defined, use the winston formatter (transport)", () => {
    const { logger, sent } = makeLogger({
      format: winston.format.simple(),
      useLoggerFormat: true,
    });

    logger.info("test message");
    expect(sent[0]).toBe("info: test message");
  });

  it("useLoggerFormat wins when both it and a custom formatter are set", () => {
    const { logger, sent } = makeLogger(
      {
        useLoggerFormat: true,
        formatter: () => "the custom formatter should never run",
      },
      { format: winston.format.simple() },
    );

    logger.info("test message");
    expect(sent[0]).toBe("info: test message");
  });

  it("a custom formatter receives a timestamp on its info argument", () => {
    const { logger, sent } = makeLogger({
      formatter: (info) => String(info.timestamp),
    });

    logger.info("test message");
    expect(sent[0]).not.toBe("undefined");
    expect(Number.isNaN(Date.parse(sent[0]))).toBe(false);
  });
});
