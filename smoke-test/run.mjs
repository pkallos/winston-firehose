#!/usr/bin/env node
// Packs the current build, installs the tarball into a scratch CJS project and a scratch ESM
// project, then actually requires/imports it and runs it as a real winston transport in both.
// Catches packaging mistakes (wrong exports map, missing dist files, module-format mismatches)
// that static checks like publint/attw can't, because it executes the real installed code.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const smokeTestDir = fileURLToPath(new URL(".", import.meta.url));

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
}

function runInherit(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function packTarball() {
  const packDir = mkdtempSync(join(tmpdir(), "winston-firehose-smoke-"));
  run("pnpm", ["pack", "--pack-destination", packDir], rootDir);
  const tarball = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
  if (!tarball) {
    throw new Error(`pnpm pack did not produce a .tgz in ${packDir}`);
  }
  return { packDir, tarballPath: join(packDir, tarball) };
}

function testFixture(name, tarballPath) {
  const fixtureDir = join(smokeTestDir, name);
  const nodeModules = join(fixtureDir, "node_modules");
  const lockfile = join(fixtureDir, "package-lock.json");

  console.log(`\n=== ${name} ===`);
  rmSync(nodeModules, { recursive: true, force: true });
  rmSync(lockfile, { force: true });

  try {
    console.log(`[${name}] installing tarball + winston + typescript...`);
    run(
      "npm",
      [
        "install",
        tarballPath,
        "winston@^3.19.0",
        "typescript@^7",
        "@types/node@^22",
        "--no-save",
        "--no-package-lock",
        "--silent",
      ],
      fixtureDir,
    );

    const entry = existsSync(join(fixtureDir, "smoke.cjs")) ? "smoke.cjs" : "smoke.mjs";
    console.log(`[${name}] running ${entry}...`);
    runInherit("node", [entry], fixtureDir);

    console.log(`[${name}] typechecking smoke.ts under moduleResolution: nodenext...`);
    runInherit("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], fixtureDir);

    console.log(`[${name}] OK`);
    return true;
  } catch (err) {
    console.error(`[${name}] FAILED:`, err.message);
    return false;
  } finally {
    rmSync(nodeModules, { recursive: true, force: true });
    rmSync(lockfile, { force: true });
  }
}

let packDir;
try {
  let tarballPath;
  ({ packDir, tarballPath } = packTarball());
  const results = ["cjs", "esm"].map((name) => testFixture(name, tarballPath));

  if (results.every(Boolean)) {
    console.log("\nsmoke test: all fixtures installed and ran cleanly.");
    process.exit(0);
  } else {
    console.error("\nsmoke test: one or more fixtures failed.");
    process.exit(1);
  }
} finally {
  if (packDir) {
    rmSync(packDir, { recursive: true, force: true });
  }
}
