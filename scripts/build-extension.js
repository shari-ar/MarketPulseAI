const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const srcDir = path.join(projectRoot, "extension");
const distDir = path.join(projectRoot, "dist");
const targetDir = path.join(distDir, "extension");

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(srcDir, targetDir, { recursive: true });

console.log(`Extension copied to ${targetDir}`);
