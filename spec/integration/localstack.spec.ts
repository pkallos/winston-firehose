import { describeFirehoseContract } from "./contract.js";
import { createLocalstackBackend } from "./support/localstack-backend.js";

describeFirehoseContract(createLocalstackBackend());
