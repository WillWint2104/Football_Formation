import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
const execute = promisify(execFile);
test("presentation, exact sources, authored cameras and independent notes survive a real database process restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "football-presentation-"));
  try {
    const run = (phase: string) => execute(process.execPath, ["--import", "tsx", "tests/persistence/presentation-reopen-worker.ts", phase, directory], { maxBuffer: 2 * 1024 * 1024 });
    const first = JSON.parse((await run("save")).stdout), reopened = JSON.parse((await run("load")).stdout);
    assert.deepEqual(reopened, first);
    assert.equal(reopened.presentation.blocks[0].views[0].rotation, 270);
    assert.equal(reopened.presentation.blocks[0].views[0].transitionSeconds, .7);
    assert.equal(reopened.presentation.blocks[0].source.ref.revision, 1);
  } finally {
    const resolved = await realpath(directory), withinTemp = relative(await realpath(tmpdir()), resolved);
    assert.ok(!isAbsolute(withinTemp) && !withinTemp.startsWith("..") && /^football-presentation-[A-Za-z0-9]+$/.test(basename(resolved)), "Cleanup stays within the allocated test directory");
    await rm(resolved, { recursive: true, force: true });
  }
});
