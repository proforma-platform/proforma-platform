import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, "..");
const outputDir = resolve(workspaceRoot, "public");
const outputFile = resolve(outputDir, "version.txt");

const readCommand = (command, fallback = "") => {
  try {
    return execSync(command, { cwd: workspaceRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
};

const commit = readCommand("git rev-parse HEAD", "unknown");
const tag = readCommand("git describe --tags --exact-match", "dev");
const builtAt = new Date().toISOString();

const content = [`commit=${commit}`, `tag=${tag}`, `built_at=${builtAt}`, "app=web-public", ""].join("\n");

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, content, "utf8");

