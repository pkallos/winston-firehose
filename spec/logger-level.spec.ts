import { vi } from "vitest";
import winston from "winston";
import { FirehoseTransport } from "@/firehose-transport.js";
import { MockSender } from "./support/test-sender.js";

describe("firehose logger transport level", () => {
  it("default level is info", () => {
    const mock = new MockSender();
    const message = "test message";
    const spy = vi.spyOn(mock, "send");

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: "test",
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message);
    expect(spy).toHaveBeenCalled();

    spy.mockClear();
    logger.debug(message);
    expect(spy).not.toHaveBeenCalled();
  });

  it("if option.level is defined, use the level", () => {
    const mock = new MockSender();
    const message = "test message";
    const spy = vi.spyOn(mock, "send");

    const logger = winston.createLogger({
      transports: [
        new FirehoseTransport({
          streamName: "test",
          firehoseSender: mock,
          level: "warn",
        }),
      ],
    });

    logger.info(message);
    expect(spy).not.toHaveBeenCalled();

    logger.warn(message);
    expect(spy).toHaveBeenCalled();
  });

  it("if options.useLoggerLevel is true, use logger level", () => {
    const mock = new MockSender();
    const message = "test message";
    const spy = vi.spyOn(mock, "send");

    const logger = winston.createLogger({
      level: "warn",
      transports: [
        new FirehoseTransport({
          streamName: "test",
          firehoseSender: mock,
          useLoggerLevel: true,
        }),
      ],
    });

    logger.info(message);
    expect(spy).not.toHaveBeenCalled();

    logger.warn(message);
    expect(spy).toHaveBeenCalled();
  });

  it("if options.useLoggerLevel is false or undefined, ignore logger level", () => {
    const mock = new MockSender();
    const message = "test message";
    const spy = vi.spyOn(mock, "send");

    const logger = winston.createLogger({
      level: "warn",
      transports: [
        new FirehoseTransport({
          streamName: "test",
          firehoseSender: mock,
        }),
      ],
    });

    logger.info(message);
    expect(spy).toHaveBeenCalled();
  });
});
