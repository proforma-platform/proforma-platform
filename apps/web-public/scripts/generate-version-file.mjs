import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, "..");
const outputDir = resolve(workspaceRoot, "public");
const outputFile = resolve(outputDir, "version.txt");

const readCommand = (command) => {
  try {
    return execSync(command, { cwd: workspaceRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
};

const commit =
  readCommand("git rev-parse HEAD") ||
  process.env.GIT_COMMIT ||
  process.env.GITHUB_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "unknown";

const tag =
  readCommand("git describe --tags --exact-match") ||
  process.env.GIT_TAG ||
  process.env.VERCEL_GIT_COMMIT_TAG ||
  "dev";

const branch =
  readCommand("git rev-parse --abbrev-ref HEAD") ||
  process.env.GIT_BRANCH ||
  process.env.GITHUB_REF_NAME ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  "unknown";

const dirtyFromGit = readCommand("git status --porcelain");
const dirtyFromEnv =
  process.env.GIT_DIRTY ||
  process.env.BUILD_GIT_DIRTY ||
  process.env.VERCEL_GIT_COMMIT_DIRTY ||
  "";
const dirty = dirtyFromGit ? "true" : dirtyFromEnv ? String(dirtyFromEnv).toLowerCase() : "false";
const nodeVersion = process.version;
const builtAt = new Date().toISOString();

const content = [
  `commit=${commit}`,
  `tag=${tag}`,
  `branch=${branch}`,
  `dirty=${dirty}`,
  `node_version=${nodeVersion}`,
  `built_at=${builtAt}`,
  "app=web-public",
  "",
].join("\n");

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, content, "utf8");
