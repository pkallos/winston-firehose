#!/usr/bin/env node

// Owns the deploy -> test -> teardown lifecycle for the real-AWS integration suite.
//
// Standalone rather than a vitest `globalSetup`: vitest's own SIGINT handler
// (vitest@4.1.10, dist/chunks/cli-api.BK8pd4xc.js:2053-2062) calls `process.exit()` on a 1ms
// timer without awaiting global teardown, so `globalSetup` would leak AWS resources on a
// Ctrl-C during a multi-minute deploy. Teardown has to be owned by a process vitest doesn't
// control.
//
//   node scripts/aws-integration.mjs        deploy, test, then always tear down
//   node scripts/aws-integration.mjs up     deploy and leave the stack running
//   node scripts/aws-integration.mjs test   run the suite against an already-deployed stack
//   node scripts/aws-integration.mjs down   tear the stack down

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(repoRoot, "infra", "sst.config.ts");
const outputsPath = join(repoRoot, "infra", ".sst", "outputs.json");

// Stable per user, not random per run: a crashed run leaves a stage the next `sst deploy`
// adopts and reconciles, rather than minting a fresh orphan every time. Per-test isolation
// comes from a UUID marker in each payload instead.
const stage = resolveStage();

/** The child currently attached to this process group, so a signal can stop it. */
let currentChild = null;
/** Memoised so a second signal joins the in-flight teardown instead of starting another. */
let teardownPromise = null;
/** Only the full cycle tears down on a signal; `up`/`test` leave the stack for the developer. */
let ownsTeardown = false;
let signalled = false;

function resolveStage() {
  const override = process.env.WF_AWS_STAGE?.trim();
  if (override) return override;
  const username = userInfo()
    .username.toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  return `aws-${username || "local"}`;
}

function run(command, args, { detached = false, env } = {}) {
  return new Promise((resolve, reject) => {
    // `detached` puts the child in its own process group, out of reach of a Ctrl-C aimed at the
    // shell's foreground group. Deliberately not `unref`d: still awaited.
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", detached, env });
    if (!detached) currentChild = child;

    const done = () => {
      if (currentChild === child) currentChild = null;
    };

    child.on("error", (error) => {
      done();
      reject(new Error(`failed to start \`${command} ${args.join(" ")}\`: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      done();
      if (code === 0) return resolve();
      const how = signal ? `signal ${signal}` : `code ${code}`;
      reject(new Error(`\`${command} ${args.join(" ")}\` exited with ${how}`));
    });
  });
}

const sst = (command, options) =>
  run("pnpm", ["exec", "sst", command, "--config", configPath, "--stage", stage], options);

async function up() {
  console.log(`\n[aws-integration] deploying stage ${stage}`);
  await sst("deploy");
}

async function down() {
  console.log(`\n[aws-integration] removing stage ${stage}`);
  await sst("remove", { detached: true });
}

function tearDown() {
  teardownPromise ??= down();
  return teardownPromise;
}

function reportTeardownFailure(error) {
  const stageHint = process.env.WF_AWS_STAGE ? `WF_AWS_STAGE=${stage} ` : "";
  console.error(`\n[aws-integration] teardown failed: ${error.message}`);
  console.error(`[aws-integration] AWS resources for stage ${stage} may still exist. Run:\n`);
  console.error(`  ${stageHint}node scripts/aws-integration.mjs down\n`);
}

/**
 * `.sst/outputs.json` is a single file shared by every stage, and it is rewritten by failed
 * deploys and by `sst remove` as well as by successful ones. Pointing the suite at whatever
 * happens to be in it would silently test the wrong stack, so it is validated before use.
 */
async function readOutputs() {
  let raw;
  try {
    raw = await readFile(outputsPath, "utf8");
  } catch {
    throw new Error(
      `no outputs at ${outputsPath} — deploy first with \`node scripts/aws-integration.mjs up\``,
    );
  }

  let outputs;
  try {
    outputs = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${outputsPath} is not valid JSON: ${error.message}`);
  }

  // `sst remove` leaves this file as literally `{}`, the normal state after every
  // successful teardown, not a wrong-stage file, so that case gets its own message.
  if (!outputs.stage) {
    throw new Error(
      `${outputsPath} has no stage (nothing is deployed) — ` +
        `deploy first with \`node scripts/aws-integration.mjs up\``,
    );
  }

  if (outputs.stage !== stage) {
    throw new Error(
      `${outputsPath} was written for stage "${outputs.stage}", not "${stage}" — ` +
        `redeploy with \`node scripts/aws-integration.mjs up\``,
    );
  }

  const required = ["bucket", "streamName", "region", "prefix"];
  const missing = required.filter((key) => !outputs[key]);
  if (missing.length > 0) {
    throw new Error(`${outputsPath} is missing ${missing.join(", ")} — the deploy did not finish`);
  }

  return outputs;
}

async function test() {
  const outputs = await readOutputs();
  console.log(
    `\n[aws-integration] testing against ${outputs.streamName} -> ${outputs.bucket} ` +
      `(${outputs.region})`,
  );

  // Plain environment variables rather than `sst shell` and `Resource`, so the specs know
  // nothing about SST and can be pointed at a hand-deployed stack.
  await run("pnpm", ["exec", "vitest", "run", "--project=aws"], {
    env: {
      ...process.env,
      WF_AWS_BUCKET: outputs.bucket,
      WF_AWS_STREAM: outputs.streamName,
      WF_AWS_REGION: outputs.region,
      WF_AWS_PREFIX: outputs.prefix,
    },
  });
}

async function cycle() {
  ownsTeardown = true;
  let exitCode = 0;

  try {
    await up();
    await test();
  } catch (error) {
    console.error(`\n[aws-integration] ${error.message}`);
    exitCode = 1;
  } finally {
    try {
      await tearDown();
    } catch (error) {
      reportTeardownFailure(error);
      exitCode = 1;
    }
  }

  return exitCode;
}

async function onSignal(signal) {
  if (signalled) {
    console.error("\n[aws-integration] already tearing down, do not interrupt again");
    return;
  }
  signalled = true;

  console.error(`\n[aws-integration] ${signal} received`);
  currentChild?.kill("SIGTERM");

  // An explicit `up` or `test` is the developer iterating against a stack they asked to keep;
  // tearing it down under them would defeat the point of the subcommands existing. Only the
  // full cycle, and a `down` already in flight, cleans up on a signal.
  if (!ownsTeardown && teardownPromise === null) {
    console.error(`[aws-integration] stage ${stage} is left running. Tear it down with:\n`);
    console.error("  node scripts/aws-integration.mjs down\n");
    process.exit(130);
  }

  try {
    await tearDown();
  } catch (error) {
    reportTeardownFailure(error);
    process.exit(1);
  }
  process.exit(130);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    void onSignal(signal);
  });
}

const commands = {
  up,
  test,
  down: tearDown,
};

const [subcommand] = process.argv.slice(2);

if (subcommand === undefined) {
  process.exitCode = await cycle();
} else if (Object.hasOwn(commands, subcommand)) {
  try {
    await commands[subcommand]();
  } catch (error) {
    if (subcommand === "down") reportTeardownFailure(error);
    else console.error(`\n[aws-integration] ${error.message}`);
    process.exitCode = 1;
  }
} else {
  console.error(`unknown subcommand "${subcommand}"`);
  console.error("usage: node scripts/aws-integration.mjs [up|test|down]");
  process.exitCode = 2;
}
