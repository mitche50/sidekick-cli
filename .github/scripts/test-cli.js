const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-test-"));
const sidekick = path.join(root, "packages", "sidekick-cli", "bin", "sidekick.js");

function runNode(args, cwd = tempDir) {
  return spawnSync("node", [sidekick, ...args], {
    cwd,
    stdio: "pipe",
    encoding: "utf8"
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

// Initialize config using CLI and update moduleDirs for test.
let result = runNode(["init"]);
assert(result.status === 0, result.stderr || "init failed");

const configPath = path.join(tempDir, ".sidekick", "config.json");
let baseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
baseConfig.moduleDirs = [root];
baseConfig.adapters = {
  agentsMd: true,
  symlinkFiles: ["AGENT.md"],
  aiderConf: false,
  geminiSettings: false,
  force: true
};
baseConfig.budgets = {
  agentsMdKernelMaxBytes: 10000,
  indexMaxBytes: 12000
};
baseConfig.telemetry = {
  enabled: true,
  mode: "local"
};
fs.writeFileSync(configPath, JSON.stringify(baseConfig, null, 2) + "\n");

result = runNode(["add", "planning-before-implementation"]);
assert(result.status === 0, result.stderr || "add failed");
baseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Positive: build generates outputs
result = runNode(["build"]);
assert(result.status === 0, result.stderr || "build failed");
assert(fs.existsSync(path.join(tempDir, "AGENTS.md")), "AGENTS.md not created");
assert(fs.existsSync(path.join(tempDir, ".sidekick", "index.min.txt")), "index.min.txt missing");
assert(fs.existsSync(path.join(tempDir, ".sidekick", "sidekick.lock.json")), "lockfile missing");
const agentPath = path.join(tempDir, "AGENT.md");
assert(fs.existsSync(agentPath), "AGENT.md adapter missing");
try {
  const stats = fs.lstatSync(agentPath);
  if (!stats.isSymbolicLink() && !stats.isFile()) {
    console.error("AGENT.md is neither a symlink nor a regular file.");
    process.exit(1);
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

// Positive: run wrapper with Sources consulted
const sourcePath = path.join(root, "planning-before-implementation", "playbook.md").replace(/\\/g, "\\\\");
result = runNode(["run", "--", "node", "-e", `console.log("Sources consulted: ${sourcePath}")`]);
assert(result.status === 0, "run wrapper should succeed when Sources consulted is present");

// Negative: missing Sources consulted should fail
result = runNode(["run", "--", "node", "-e", "console.log('hi')"]);
assert(result.status !== 0, "run wrapper should fail when Sources consulted is missing");

// Negative: invalid Sources path should fail
result = runNode(["run", "--", "node", "-e", "console.log('Sources consulted: /tmp/does-not-exist')"]);
assert(result.status !== 0, "run wrapper should fail when Sources consulted does not map to modules");

// Negative: nonexistent path inside module should fail
const nonexistentInsideModule = path.join(root, "planning-before-implementation", "missing.md").replace(/\\/g, "\\\\");
result = runNode(["run", "--", "node", "-e", `console.log("Sources consulted: ${nonexistentInsideModule}")`]);
assert(result.status !== 0, "run wrapper should fail when Sources consulted points to a missing file inside a module");

// Negative: mixed real + missing sources should fail
const realPlaybook = path.join(root, "planning-before-implementation", "playbook.md").replace(/\\/g, "\\\\");
result = runNode(["run", "--", "node", "-e", `console.log("Sources consulted: ${realPlaybook}, ${nonexistentInsideModule}")`]);
assert(result.status !== 0, "run wrapper should fail when any Sources consulted path is missing");

// Positive: allow-missing should pass even with missing sources
result = runNode(["run", "--allow-missing", "--", "node", "-e", `console.log("Sources consulted: ${nonexistentInsideModule}")`]);
assert(result.status === 0, "run wrapper should allow missing sources when --allow-missing is set");

// Negative: budgets enforced
const tightConfig = JSON.parse(JSON.stringify(baseConfig));
tightConfig.budgets.agentsMdKernelMaxBytes = 10;
fs.writeFileSync(configPath, JSON.stringify(tightConfig, null, 2) + "\n");
result = runNode(["build"]);
assert(result.status !== 0, "build should fail when kernel budget is too small");

// Positive: promote writes project kernel template
const promoteConfig = JSON.parse(JSON.stringify(baseConfig));
fs.writeFileSync(configPath, JSON.stringify(promoteConfig, null, 2) + "\n");
result = runNode(["promote", "planning-before-implementation", "--top", "2"]);
assert(result.status === 0, "promote should succeed");
const promotedPath = path.join(tempDir, "templates", "agents-md", "kernel.md");
assert(fs.existsSync(promotedPath), "promote should write kernel template");

// Gemini settings idempotency (new format + legacy acceptance)
const geminiConfig = JSON.parse(JSON.stringify(baseConfig));
geminiConfig.adapters.geminiSettings = true;
geminiConfig.adapters.force = false;
fs.writeFileSync(configPath, JSON.stringify(geminiConfig, null, 2) + "\n");
result = runNode(["build"]);
assert(result.status === 0, "build with geminiSettings should succeed");
result = runNode(["build"]);
assert(result.status === 0, "second build with geminiSettings should be idempotent");

// Negative: .gemini exists as a file should fail with no partial outputs (fresh repo)
const tempDirGemini = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-test-gemini-"));
result = runNode(["init"], tempDirGemini);
assert(result.status === 0, result.stderr || "init (gemini test) failed");
const geminiConfigPath = path.join(tempDirGemini, ".sidekick", "config.json");
let geminiConfigFresh = JSON.parse(fs.readFileSync(geminiConfigPath, "utf8"));
geminiConfigFresh.moduleDirs = [root];
geminiConfigFresh.adapters = {
  agentsMd: true,
  symlinkFiles: [],
  aiderConf: false,
  geminiSettings: true,
  force: false
};
fs.writeFileSync(geminiConfigPath, JSON.stringify(geminiConfigFresh, null, 2) + "\n");
result = runNode(["add", "planning-before-implementation"], tempDirGemini);
assert(result.status === 0, result.stderr || "add (gemini test) failed");
const geminiPath = path.join(tempDirGemini, ".gemini");
fs.writeFileSync(geminiPath, "not a directory");
result = runNode(["build"], tempDirGemini);
assert(result.status !== 0, "build should fail when .gemini is a file");
assert(!fs.existsSync(path.join(tempDirGemini, ".sidekick", "index.min.txt")), "index.min.txt should not be written on failure");
assert(!fs.existsSync(path.join(tempDirGemini, "AGENTS.md")), "AGENTS.md should not be written on failure");
assert(!fs.existsSync(path.join(tempDirGemini, ".sidekick", "sidekick.lock.json")), "lockfile should not be written on failure");

// Negative: invalid config shape should fail fast
const invalidConfig = JSON.parse(JSON.stringify(baseConfig));
invalidConfig.modules = "planning-before-implementation";
fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2) + "\n");
result = runNode(["build"]);
assert(result.status !== 0, "build should fail when config.modules is not an array");
