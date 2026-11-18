import { test } from "node:test"
import assert from "node:assert/strict"
import { extractProviderUrl, checkProviderReachability, checkReachability, auditAsync } from "../src/index.js"

test("extractProviderUrl detects exact option key", () => {
  assert.deepEqual(extractProviderUrl({ options: { baseURL: "https://api.openai.com/v1" } }), {
    option: "options.baseURL",
    url: "https://api.openai.com/v1",
  })

  assert.deepEqual(extractProviderUrl({ options: { baseUrl: "http://localhost:11434" } }), {
    option: "options.baseUrl",
    url: "http://localhost:11434",
  })

  assert.deepEqual(extractProviderUrl({ baseURL: "https://api.anthropic.com" }), {
    option: "baseURL",
    url: "https://api.anthropic.com",
  })

  assert.equal(extractProviderUrl({}), null)
})

test("detects an unreachable host and names the exact option", async () => {
  const fakeLookup = async () => {
    const err = new Error("getaddrinfo ENOTFOUND unreachable-stale-provider.invalid")
    err.code = "ENOTFOUND"
    throw err
  }

  const finding = await checkProviderReachability(
    "custom-ai",
    { options: { baseURL: "https://unreachable-stale-provider.invalid/v1" } },
    { lookupFn: fakeLookup },
  )

  assert.ok(finding)
  assert.equal(finding.severity, "error")
  assert.equal(finding.option, "options.baseURL")
  assert.equal(finding.provider, "custom-ai")
  assert.match(finding.message, /provider "custom-ai" option "options\.baseURL" host is unreachable/)
  assert.match(finding.message, /ENOTFOUND/)
})

test("passes when host is reachable", async () => {
  const fakeLookup = async () => ({ address: "93.184.216.34", family: 4 })

  const finding = await checkProviderReachability(
    "good-ai",
    { options: { baseURL: "https://example.com/v1" } },
    { lookupFn: fakeLookup },
  )

  assert.equal(finding, null)
})

test("checkReachability scans all providers and flags only unreachable ones", async () => {
  const fakeLookup = async (hostname) => {
    if (hostname === "broken.invalid") {
      const err = new Error("ENOTFOUND")
      err.code = "ENOTFOUND"
      throw err
    }
    return { address: "127.0.0.1", family: 4 }
  }

  const config = {
    provider: {
      p1: { options: { baseURL: "https://working.com/v1" } },
      p2: { options: { baseUrl: "http://broken.invalid/api" } },
    },
  }

  const findings = await checkReachability(config, { lookupFn: fakeLookup })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].provider, "p2")
  assert.equal(findings[0].option, "options.baseUrl")
})
