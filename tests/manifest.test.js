const assert = require("assert");
const path = require("path");
const { describe, it } = require("node:test");

const manifestPath = path.join(__dirname, "..", "extension", "manifest.json");
const manifest = require(manifestPath);

describe("manifest alignment with documentation", () => {
  it("includes popup and navigator entrypoints", () => {
    assert.strictEqual(manifest.action.default_popup, "popup/popup.html");
    assert.deepStrictEqual(manifest.background, {
      service_worker: "background/navigator.js",
      type: "module",
    });
  });

  it("ships offline assets through web accessible resources", () => {
    const [resources] = manifest.web_accessible_resources;
    assert.ok(resources.resources.includes("analysis/models/*"));
    assert.ok(resources.resources.includes("vendor/*"));
  });

  it("requests only required permissions", () => {
    assert.deepStrictEqual(manifest.permissions.sort(), ["scripting", "storage", "tabs"].sort());
    assert.deepStrictEqual(manifest.host_permissions, ["https://*.tsetmc.com/*"]);
  });
});
