const assert = require("assert");
const path = require("path");
const { describe, it } = require("node:test");

const manifestPath = path.join(__dirname, "..", "extension", "manifest.json");
const manifest = require(manifestPath);

describe("extension manifest", () => {
  it("includes core metadata", () => {
    assert.strictEqual(manifest.name, "MarketPulseAI");
    assert.strictEqual(manifest.version, "0.0.1");
    assert.strictEqual(manifest.manifest_version, 3);
  });

  it("defines a popup action", () => {
    assert.ok(manifest.action, "action is defined");
    assert.strictEqual(manifest.action.default_popup, "popup.html");
  });
});
