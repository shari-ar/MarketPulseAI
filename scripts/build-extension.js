const fs = require("fs");
const path = require("path");
const { loadEnvConfig } = require("./env-config");

const projectRoot = path.resolve(__dirname, "..");
const config = loadEnvConfig();

const srcDir = path.join(projectRoot, config.extensionSrcDir);
const distDir = path.join(projectRoot, config.extensionDistDir);
const distRoot = path.dirname(distDir);

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });
fs.cpSync(srcDir, distDir, { recursive: true });

console.log(`Extension copied from ${srcDir} to ${distDir}`);
