const fs = require("fs");
const path = require("path");
const assert = require("assert");
const dotenv = require("dotenv");
const { test } = require("node:test");

test(".env.example entries are all populated", () => {
  const envPath = path.resolve(__dirname, "../.env.example");
  const parsed = dotenv.parse(fs.readFileSync(envPath));

  Object.entries(parsed).forEach(([key, value]) => {
    assert.notStrictEqual(value, undefined, `${key} should be defined`);
    assert.notStrictEqual(value, "", `${key} should not be empty`);
  });
});
