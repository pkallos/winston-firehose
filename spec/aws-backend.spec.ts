import { createAwsBackend } from "./integration/support/aws-backend.js";

const FULL_ENV = {
  WF_AWS_BUCKET: "wf-delivery-bucket",
  WF_AWS_STREAM: "wf-delivery-stream",
  WF_AWS_REGION: "us-east-1",
  WF_AWS_PREFIX: "records/",
};

describe("aws backend", () => {
  it("describes itself as an s3-delivering backend", () => {
    const backend = createAwsBackend(FULL_ENV);

    expect(backend.name).toBe("aws");
    expect(backend.deliversToS3).toBe(true);
    expect(backend.missingStreamErrorName).toBe("ResourceNotFoundException");
  });

  it("is enabled when every WF_AWS_ variable is set", () => {
    expect(createAwsBackend(FULL_ENV).enabled).toBe(true);
  });

  it("is disabled when a WF_AWS_ variable is missing or empty", () => {
    for (const key of Object.keys(FULL_ENV)) {
      expect(createAwsBackend({ ...FULL_ENV, [key]: undefined }).enabled).toBe(false);
      expect(createAwsBackend({ ...FULL_ENV, [key]: "" }).enabled).toBe(false);
    }
  });

  it("reads env without touching aws when nothing is configured", () => {
    expect(createAwsBackend({}).enabled).toBe(false);
  });
});
