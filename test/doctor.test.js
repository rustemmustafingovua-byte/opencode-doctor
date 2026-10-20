import { test } from "node:test"
import assert from "node:assert/strict"
import { parseJsonc, checkProviders, audit } from "../src/index.js"

test("parses JSONC with comments and trailing commas", () => {
  const cfg = parseJsonc(`{
    // a comment
    "model": "x/y",
    "provider": { "a": {}, },
  }`)
  assert.equal(cfg.model, "x/y")
  assert.ok(cfg.provider.a)
})

test("flags a provider without credentials", () => {
  const providers = checkProviders({ provider: { a: { models: { m1: {} } } } }, {}, {})
  assert.equal(providers[0].hasKey, false)
  assert.ok(providers[0].findings.some((f) => /no credentials/.test(f.message)))
})

test("counts free and paid models", () => {
  const providers = checkProviders(
    { provider: { a: { models: { f: { cost: { input: 0, output: 0 } }, p: { cost: { input: 3, output: 15 } } } } } },
    { A: "k" },
    {},
  )
  assert.equal(providers[0].freeModels, 1)
  assert.equal(providers[0].paidModels, 1)
})

test("an empty whitelist is an error", () => {
  const providers = checkProviders({ provider: { a: { whitelist: [], models: { m: {} } } } }, { A: "k" }, {})
  assert.ok(providers[0].findings.some((f) => f.severity === "error"))
})

test("a missing config is reported, not thrown", () => {
  const r = audit({ configPath: "/nope/opencode.jsonc" })
  assert.equal(r.ok, false)
  assert.ok(r.findings.length > 0)
})
