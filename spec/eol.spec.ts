import os from "node:os";
import winston from "winston";
import { makeLogger } from "./support/harness.js";

describe("firehose logger transport eol", () => {
  it.each([
    ["default", undefined, ""],
    ["a single char", "$", "$"],
    ["a newline", os.EOL, os.EOL],
  ])("delimiter: %s", (_label, eol, expectedSuffix) => {
    const { logger, sent } = makeLogger({ eol });

    logger.info("test message");

    expect(sent[0].endsWith(expectedSuffix)).toBe(true);
    const body = expectedSuffix ? sent[0].slice(0, -expectedSuffix.length) : sent[0];
    expect(JSON.parse(body).message).toBe("test message");
  });

  it("allows the user to set EOL delimiter to a single char, with formatter", () => {
    const { logger, sent } = makeLogger({
      formatter: (info) => `formatted: ${info.level} ${info.message}`,
      eol: "$",
    });

    logger.info("test message");
    expect(sent[0]).toBe("formatted: info test message$");
  });

  it("if option.useLoggerFormat is defined, options.eol still works", () => {
    const { logger, sent } = makeLogger(
      { useLoggerFormat: true, eol: os.EOL },
      { format: winston.format.simple() },
    );

    logger.info("test message");
    expect(sent[0]).toBe(`info: test message${os.EOL}`);
  });

  it("if metadata is passed, options.eol still works", () => {
    const { logger, sent } = makeLogger({ eol: "$" });

    logger.info("test message", { snakes: "delicious" });

    expect(sent[0].endsWith("$")).toBe(true);
    const actualMessage = JSON.parse(sent[0].slice(0, -1));
    expect(actualMessage.message).toBe("test message");
    expect(actualMessage.snakes).toBe("delicious");
    expect(actualMessage.level).toBe("info");
    expect(actualMessage.timestamp).toBeDefined();
  });
});
