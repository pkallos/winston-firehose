import type { FirehoseClientConfig } from "@aws-sdk/client-firehose";

/** One object a backend's destination actually received. */
export interface DeliveredObject {
  readonly key: string;
  readonly body: string;
}

export interface WaitOptions {
  /** Total time to poll before rejecting. */
  timeoutMs?: number;
  /** Delay before the first poll, since delivery is never instant. */
  initialDelayMs?: number;
  /** Delay between polls. */
  intervalMs?: number;
}

/** Reads what a backend's destination actually received. */
export interface DeliveredObjectReader {
  /**
   * Polls the destination until a single delivered object contains `text` verbatim,
   * then resolves with that object. Rejects with a diagnostic listing every object
   * seen if the deadline passes.
   *
   * Matching within one object, rather than across a concatenation of bodies, is what
   * makes record-adjacency assertions (e.g. for `eol` framing) meaningful: an object
   * boundary can never manufacture a false adjacency.
   */
  waitForObjectContaining(text: string, options?: WaitOptions): Promise<DeliveredObject>;
}

/** Live resources for one contract run, produced by `FirehoseBackend.setUp`. */
export interface FirehoseTarget {
  /** Passed to `new FirehoseTransport({ firehoseOptions })`. */
  readonly firehoseOptions: FirehoseClientConfig;
  /** The delivery stream the tests write to. */
  readonly streamName: string;
  /** Returns a syntactically valid delivery stream name guaranteed not to exist. */
  badStreamName(): string;
  /** Present iff the owning backend's `deliversToS3` is true. */
  readonly delivered?: DeliveredObjectReader;
}

export interface FirehoseBackend {
  /** Appears in the describe() title: "firehose contract (localstack)". */
  readonly name: string;

  /**
   * Whether this backend can run at all right now (e.g. the AWS backend is disabled
   * when its environment variables aren't set). Static: known at module-evaluation
   * time, before any hook runs.
   */
  readonly enabled: boolean;

  /**
   * Whether this backend's destination can be read back to verify delivery. Static
   * for the same reason as `enabled`: `skipIf` evaluates before `setUp` runs, so
   * gating on a `beforeAll`-assigned value would skip every S3 test, silently and
   * permanently green.
   */
  readonly deliversToS3: boolean;

  /**
   * The AWS SDK error name a `PutRecord` to a nonexistent stream produces on this
   * backend. Real AWS returns `ResourceNotFoundException` only when the calling
   * identity holds broad `firehose:PutRecord` access; a scoped policy can return
   * `AccessDeniedException` instead. This documents the assumption rather than
   * burying it in an assertion.
   */
  readonly missingStreamErrorName: string;

  setUp(): Promise<FirehoseTarget>;
  tearDown(): Promise<void>;
}
