// Integration test against the real service. Skipped unless LIVE=1.
//   LIVE=1 npm test
import { test } from "node:test"
import assert from "node:assert/strict"

const LIVE = process.env.LIVE === "1"
const skip = LIVE ? false : "set LIVE=1 to run the integration test"

import { audit } from "../src/index.js"
import { join } from "node:path"
import { homedir } from "node:os"

test("audits the local OpenCode install", { skip }, () => {
  const report = audit({
    configPath: join(homedir(), ".config", "opencode", "opencode.jsonc"),
  })
  assert.ok(report.config, "the config must parse")
  assert.equal(typeof report.score, "number")
})
