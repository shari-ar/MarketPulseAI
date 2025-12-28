const fs = require("fs");
const path = require("path");
const { loadEnvConfig, writeRuntimeConfig } = require("./env-config");
const { logInfo } = require("./logger");

const projectRoot = path.resolve(__dirname, "..");
logInfo("Loading build configuration.");
const config = loadEnvConfig();

const srcDir = path.join(projectRoot, config.extensionSrcDir);
const distDir = path.join(projectRoot, config.extensionDistDir);
const distRoot = path.dirname(distDir);

logInfo("Preparing extension distribution directory.");
fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });
fs.cpSync(srcDir, distDir, { recursive: true });

const runtimeConfigPath = path.join(distDir, "runtime-config.js");
logInfo("Writing runtime configuration for extension build.");
writeRuntimeConfig(config, runtimeConfigPath);

logInfo(`Extension copied from ${srcDir} to ${distDir}`);
