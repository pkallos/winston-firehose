import { describeFirehoseContract } from "./contract.js";
import { createAwsBackend } from "./support/aws-backend.js";

describeFirehoseContract(createAwsBackend());
