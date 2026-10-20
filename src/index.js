/**
 * opencode-doctor — audit an OpenCode installation.
 *
 * Checks the things that silently break a setup: a config that does not parse,
 * providers without credentials, a `whitelist` that hides everything, paid
 * models left in the picker, MCP servers that point at missing files, and
 * skills that are not discovered.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, isAbsolute, resolve } from "node:path"

/** Strip // comments and trailing commas so JSONC can be parsed. */
export function parseJsonc(text) {
  const withoutComments = String(text)
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(withoutComments)
}

export const SEVERITY = { error: "error", warn: "warn", info: "info" }

/** Check the config file itself. */
export function checkConfig(path) {
  const out = { path, exists: existsSync(path), findings: [] }
  if (!out.exists) {
    out.findings.push({ severity: "error", message: `config not found: ${path}` })
    return out
  }
  try {
    out.config = parseJsonc(readFileSync(path, "utf8"))
  } catch (err) {
    out.findings.push({ severity: "error", message: `config does not parse: ${err.message}` })
  }
  return out
}

/** Which providers actually have credentials. */
export function checkProviders(config, env = process.env, auth = {}) {
  const out = []
  for (const [id, p] of Object.entries(config?.provider || {})) {
    const envNames = p.env || []
    const keyFromEnv = envNames.find((n) => env[n])
    const keyFromAuth = auth[id]?.key
    const keyFromFile = extractFileRef(p.options?.apiKey)
    const hasKey = !!(keyFromEnv || keyFromAuth || keyFromFile)
    const models = Object.keys(p.models || {})
    const freeModels = models.filter((m) => isFree(p.models[m]))
    const paidModels = models.filter((m) => !isFree(p.models[m]))
    const findings = []
    if (!hasKey) findings.push({ severity: "warn", message: `no credentials for provider "${id}"` })
    if (p.whitelist && p.whitelist.length === 0)
      findings.push({ severity: "error", message: `provider "${id}" has an empty whitelist — no models are visible` })
    if (p.whitelist && p.whitelist.length && models.length && p.whitelist.some((m) => !models.includes(m)))
      findings.push({ severity: "warn", message: `provider "${id}" whitelist lists models that are not defined` })
    if (paidModels.length && !p.whitelist)
      findings.push({ severity: "info", message: `provider "${id}" exposes ${paidModels.length} paid model(s)` })
    out.push({
      id,
      hasKey,
      models: models.length,
      freeModels: freeModels.length,
      paidModels: paidModels.length,
      visible: p.whitelist ? p.whitelist.length : models.length,
      findings,
    })
  }
  return out
}

function isFree(model) {
  if (!model) return false
  const c = model.cost
  if (!c) return true
  return Number(c.input ?? 0) === 0 && Number(c.output ?? 0) === 0
}

function extractFileRef(value) {
  if (typeof value !== "string") return null
  const m = value.match(/^\{file:(.+)\}$/)
  if (!m) return null
  return m[1].replace(/^~/, homedir())
}

/** Check MCP servers, skills, agents, commands. */
export function checkAssets(config, configDir) {
  const findings = []
  const mcp = []
  for (const [name, s] of Object.entries(config?.mcp || {})) {
    const enabled = s?.enabled !== false
    let missing = null
    if (s?.type === "local" && s?.command) {
      const cmdPath = s.command[0]
      if (cmdPath.includes("/") && !existsSync(cmdPath)) missing = cmdPath
    }
    if (s?.type === "remote" && !s?.url) missing = "remote server without a url"
    if (missing) findings.push({ severity: "error", message: `mcp "${name}" points at a missing file: ${missing}` })
    mcp.push({ name, type: s?.type || "local", enabled, missing })
  }
  const dirs = {
    skills: join(configDir, "skills"),
    agents: join(configDir, "agents"),
    commands: join(configDir, "commands"),
    plugins: join(configDir, "plugin"),
  }
  const counts = {}
  for (const [kind, dir] of Object.entries(dirs)) {
    counts[kind] = existsSync(dir)
      ? readdirSafe(dir).filter((f) => !f.startsWith(".")).length
      : 0
  }
  return { mcp, findings, counts }
}

function readdirSafe(dir) {
  try {
    return require("node:fs").readdirSync(dir)
  } catch {
    return []
  }
}

/** Full audit. */
export function audit({ configPath, env = process.env, auth = {} } = {}) {
  const configDir = join(homedir(), ".config", "opencode")
  const path = configPath || join(configDir, "opencode.jsonc")
  const cfg = checkConfig(path)
  const findings = [...cfg.findings]
  if (!cfg.config) return { ok: false, findings, providers: [], assets: null }

  const providers = checkProviders(cfg.config, env, auth)
  for (const p of providers) findings.push(...p.findings.map((f) => ({ ...f, provider: p.id })))

  const assets = checkAssets(cfg.config, configDir)
  findings.push(...assets.findings)

  const model = cfg.config.model
  if (!model) findings.push({ severity: "warn", message: "no default model configured" })
  else if (!cfg.config.provider || !Object.keys(cfg.config.provider).some((id) => model.startsWith(id + "/")))
    findings.push({ severity: "warn", message: `default model "${model}" does not belong to any configured provider` })

  const errors = findings.filter((f) => f.severity === "error").length
  const warns = findings.filter((f) => f.severity === "warn").length
  return {
    ok: errors === 0,
    config: cfg.config,
    providers,
    assets,
    findings,
    score: Math.max(0, 100 - errors * 20 - warns * 6),
  }
}
