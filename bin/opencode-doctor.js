#!/usr/bin/env node
/**
 * opencode-doctor — audit an OpenCode install in one command.
 *
 *   opencode-doctor
 *   opencode-doctor --config ~/.config/opencode/opencode.jsonc
 *   opencode-doctor --json
 */
import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { audit } from "../src/index.js"

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : d
}
const authPath = join(homedir(), ".local", "share", "opencode", "auth.json")
const auth = existsSync(authPath) ? JSON.parse(readFileSync(authPath, "utf8")) : {}

const report = audit({
  configPath: arg("--config"),
  env: process.env,
  auth,
})

if (argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}

console.log(`\nconfig      ${report.config?.path || "(missing)"}`)
console.log(`score       ${report.score}/100   ${report.ok ? "healthy" : "needs fixes"}\n`)
if (report.providers?.length) {
  console.log("providers")
  for (const p of report.providers) {
    console.log(
      `  ${p.hasKey ? "✓" : "✗"} ${p.id.padEnd(14)} ${String(p.models).padStart(3)} моделей  видно ${String(p.visible).padStart(3)}  free ${p.freeModels}  paid ${p.paidModels}`,
    )
  }
  console.log("")
}
if (report.assets) {
  console.log(`mcp         ${report.assets.mcp.filter((m) => m.enabled).length} включено / ${report.assets.mcp.length}`)
  console.log(`assets      skills ${report.assets.counts.skills} · agents ${report.assets.counts.agents} · commands ${report.assets.counts.commands} · plugins ${report.assets.counts.plugins}\n`)
}
if (report.findings.length) {
  console.log("findings")
  for (const f of report.findings) {
    const mark = f.severity === "error" ? "✗" : f.severity === "warn" ? "!" : "·"
    console.log(`  ${mark} ${f.message}`)
  }
  console.log("")
} else {
  console.log("no findings — install is clean\n")
}
process.exit(report.ok ? 0 : 1)
