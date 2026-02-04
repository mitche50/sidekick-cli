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

function jsString(value) {
  return JSON.stringify(value);
}

function cliPath(value) {
  return value.replace(/\\/g, "/");
}

function writeSourcesScript(dir) {
  const scriptPath = path.join(dir, "emit-sources.js");
  fs.writeFileSync(
    scriptPath,
    'const src = process.env.SOURCES; if (src) console.log("Sources consulted: " + src);',
    "utf8"
  );
  return scriptPath;
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
baseConfig.moduleDirs = [path.join(root, "skills")];
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

// List modules should include descriptions
result = runNode(["list"]);
assert(result.status === 0, result.stderr || "list failed");
assert(result.stdout.includes("planning-before-implementation"), "list should include planning-before-implementation");
assert(result.stdout.includes("Produces a plan-first workflow"), "list should include description");

// Install skills into a target directory
const installRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-install-repo-"));
const installSkillsDir = path.join(installRepo, "skills", "install-skill");
fs.mkdirSync(path.join(installSkillsDir, "snippets"), { recursive: true });
fs.writeFileSync(path.join(installSkillsDir, "SKILL.md"), "---\nname: install-skill\ndescription: Install skill\n---\n");
fs.writeFileSync(path.join(installSkillsDir, "sidekick.module.json"), JSON.stringify({ name: "install-skill" }, null, 2) + "\n");
fs.writeFileSync(path.join(installSkillsDir, "playbook.md"), "# Install\n");
fs.writeFileSync(path.join(installSkillsDir, "snippets", "kernel.md"), "- Install rule\n");
const installTarget = path.join(tempDir, ".agents-skills");
result = runNode(["update", "--repo", installRepo, "--dir", installTarget]);
assert(result.status === 0, result.stderr || "update --repo should succeed");
assert(fs.existsSync(path.join(installTarget, "install-skill", "SKILL.md")), "update should copy skills to target");

// Update should refresh from metadata without --repo
fs.writeFileSync(path.join(installSkillsDir, "playbook.md"), "# Install updated\n");
result = runNode(["update", "--dir", installTarget]);
assert(result.status === 0, result.stderr || "update should succeed");

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
const sourcePath = cliPath(path.join(root, "skills", "planning-before-implementation", "playbook.md"));
const sourcesScript = writeSourcesScript(tempDir);
result = spawnSync("node", [sidekick, "run", "--", "node", sourcesScript], {
  cwd: tempDir,
  stdio: "pipe",
  encoding: "utf8",
  env: { ...process.env, SOURCES: sourcePath }
});
assert(result.status === 0, "run wrapper should succeed when Sources consulted is present");

// Negative: missing Sources consulted should fail
result = runNode(["run", "--", "node", "-e", "console.log('hi')"]);
assert(result.status !== 0, "run wrapper should fail when Sources consulted is missing");

// Negative: invalid Sources path should fail
result = runNode(["run", "--", "node", "-e", "console.log('Sources consulted: /tmp/does-not-exist')"]);
assert(result.status !== 0, "run wrapper should fail when Sources consulted does not map to modules");

// Negative: nonexistent path inside module should fail
const nonexistentInsideModule = cliPath(path.join(root, "skills", "planning-before-implementation", "missing.md"));
result = spawnSync("node", [sidekick, "run", "--", "node", sourcesScript], {
  cwd: tempDir,
  stdio: "pipe",
  encoding: "utf8",
  env: { ...process.env, SOURCES: nonexistentInsideModule }
});
assert(result.status !== 0, "run wrapper should fail when Sources consulted points to a missing file inside a module");

// Negative: mixed real + missing sources should fail
const realPlaybook = cliPath(path.join(root, "skills", "planning-before-implementation", "playbook.md"));
result = spawnSync("node", [sidekick, "run", "--", "node", sourcesScript], {
  cwd: tempDir,
  stdio: "pipe",
  encoding: "utf8",
  env: { ...process.env, SOURCES: `${realPlaybook}, ${nonexistentInsideModule}` }
});
assert(result.status !== 0, "run wrapper should fail when any Sources consulted path is missing");

// Positive: allow-missing should pass even with missing sources
result = spawnSync("node", [sidekick, "run", "--allow-missing", "--", "node", sourcesScript], {
  cwd: tempDir,
  stdio: "pipe",
  encoding: "utf8",
  env: { ...process.env, SOURCES: nonexistentInsideModule }
});
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
geminiConfig.adapters.copilotInstructions = true;
geminiConfig.adapters.claudeMd = true;
geminiConfig.adapters.claudeMdSymlink = true;
fs.writeFileSync(configPath, JSON.stringify(geminiConfig, null, 2) + "\n");
result = runNode(["build"]);
assert(result.status === 0, "build with geminiSettings should succeed");
result = runNode(["build"]);
assert(result.status === 0, "second build with geminiSettings should be idempotent");
assert(fs.existsSync(path.join(tempDir, ".github", "copilot-instructions.md")), "copilot instructions should be written");
const claudePath = path.join(tempDir, "CLAUDE.md");
assert(fs.existsSync(claudePath), "CLAUDE.md should be written");

// Negative: .gemini exists as a file should fail with no partial outputs (fresh repo)
const tempDirGemini = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-test-gemini-"));
result = runNode(["init"], tempDirGemini);
assert(result.status === 0, result.stderr || "init (gemini test) failed");
const geminiConfigPath = path.join(tempDirGemini, ".sidekick", "config.json");
let geminiConfigFresh = JSON.parse(fs.readFileSync(geminiConfigPath, "utf8"));
geminiConfigFresh.moduleDirs = [path.join(root, "skills")];
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

// Negative: .github exists as a file should fail with no partial outputs (fresh repo)
const tempDirGitHub = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-test-github-"));
result = runNode(["init"], tempDirGitHub);
assert(result.status === 0, result.stderr || "init (github test) failed");
const githubConfigPath = path.join(tempDirGitHub, ".sidekick", "config.json");
let githubConfig = JSON.parse(fs.readFileSync(githubConfigPath, "utf8"));
githubConfig.moduleDirs = [path.join(root, "skills")];
githubConfig.adapters = {
  agentsMd: true,
  symlinkFiles: [],
  aiderConf: false,
  geminiSettings: false,
  copilotInstructions: true,
  force: false
};
fs.writeFileSync(githubConfigPath, JSON.stringify(githubConfig, null, 2) + "\n");
result = runNode(["add", "planning-before-implementation"], tempDirGitHub);
assert(result.status === 0, result.stderr || "add (github test) failed");
const githubDirPath = path.join(tempDirGitHub, ".github");
fs.writeFileSync(githubDirPath, "not a directory");
result = runNode(["build"], tempDirGitHub);
assert(result.status !== 0, "build should fail when .github is a file");
assert(!fs.existsSync(path.join(tempDirGitHub, ".sidekick", "index.min.txt")), "index.min.txt should not be written on failure");
assert(!fs.existsSync(path.join(tempDirGitHub, "AGENTS.md")), "AGENTS.md should not be written on failure");
assert(!fs.existsSync(path.join(tempDirGitHub, ".sidekick", "sidekick.lock.json")), "lockfile should not be written on failure");

// Negative: invalid config shape should fail fast
const invalidConfig = JSON.parse(JSON.stringify(baseConfig));
invalidConfig.modules = "planning-before-implementation";
fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2) + "\n");
result = runNode(["build"]);
assert(result.status !== 0, "build should fail when config.modules is not an array");
fs.writeFileSync(configPath, JSON.stringify(baseConfig, null, 2) + "\n");

// Add repo: install a local repo into cache and add a skill
const repoTemp = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-skill-repo-"));
const repoName = path.basename(repoTemp);
const skillDir = path.join(repoTemp, "demo-skill");
fs.mkdirSync(path.join(skillDir, "snippets"), { recursive: true });
fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo skill\n---\n");
fs.writeFileSync(path.join(skillDir, "sidekick.module.json"), JSON.stringify({ name: "demo-skill" }, null, 2) + "\n");
fs.writeFileSync(path.join(skillDir, "playbook.md"), "# Demo\n");
fs.writeFileSync(path.join(skillDir, "snippets", "kernel.md"), "- Demo rule\n");

const cacheDir = path.join(tempDir, ".sidekick-cache");
result = runNode(["add", "demo-skill", "--repo", repoTemp, "--cache-dir", cacheDir]);
assert(result.status === 0, result.stderr || "add --repo should succeed");
const updatedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const expectedRepoDir = path.join(cacheDir, repoName);
assert(updatedConfig.moduleDirs.includes(expectedRepoDir), "moduleDirs should include installed repo path");
assert(updatedConfig.modules.includes("demo-skill"), "modules should include demo-skill");
assert(fs.existsSync(path.join(expectedRepoDir, "demo-skill", "SKILL.md")), "installed repo should contain skill");

// Add repo: skills under ./skills should be discovered
const repoTempNested = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-skill-repo-nested-"));
const repoNameNested = path.basename(repoTempNested);
const nestedSkillsRoot = path.join(repoTempNested, "skills", "nested-skill");
fs.mkdirSync(path.join(nestedSkillsRoot, "snippets"), { recursive: true });
fs.writeFileSync(path.join(nestedSkillsRoot, "SKILL.md"), "---\nname: nested-skill\ndescription: Nested skill\n---\n");
fs.writeFileSync(path.join(nestedSkillsRoot, "sidekick.module.json"), JSON.stringify({ name: "nested-skill" }, null, 2) + "\n");
fs.writeFileSync(path.join(nestedSkillsRoot, "playbook.md"), "# Nested\n");
fs.writeFileSync(path.join(nestedSkillsRoot, "snippets", "kernel.md"), "- Nested rule\n");
const cacheDirNested = path.join(tempDir, ".sidekick-cache-nested");
result = runNode(["add", "nested-skill", "--repo", repoTempNested, "--cache-dir", cacheDirNested]);
assert(result.status === 0, result.stderr || "add --repo should support skills/ layout");
const configAfterNested = JSON.parse(fs.readFileSync(configPath, "utf8"));
const expectedRepoDirNested = path.join(cacheDirNested, repoNameNested, "skills");
assert(configAfterNested.moduleDirs.includes(expectedRepoDirNested), "moduleDirs should include installed repo skills path");
assert(configAfterNested.modules.includes("nested-skill"), "modules should include nested-skill");
assert(fs.existsSync(path.join(expectedRepoDirNested, "nested-skill", "SKILL.md")), "installed repo should contain nested skill");

// Negative: repo already installed should fail
result = runNode(["add", "demo-skill", "--repo", repoTemp, "--cache-dir", cacheDir]);
assert(result.status !== 0, "add --repo should fail when repo is already installed");

// Add repo: if repo has a single skill and no --skill is provided, it should add that skill
const repoTempSingle = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-skill-repo-single-"));
const repoNameSingle = path.basename(repoTempSingle);
const singleDir = path.join(repoTempSingle, "solo-skill");
fs.mkdirSync(path.join(singleDir, "snippets"), { recursive: true });
fs.writeFileSync(path.join(singleDir, "SKILL.md"), "---\nname: solo-skill\ndescription: Solo skill\n---\n");
fs.writeFileSync(path.join(singleDir, "sidekick.module.json"), JSON.stringify({ name: "solo-skill" }, null, 2) + "\n");
fs.writeFileSync(path.join(singleDir, "playbook.md"), "# Solo\n");
fs.writeFileSync(path.join(singleDir, "snippets", "kernel.md"), "- Solo rule\n");
const cacheDirSingle = path.join(tempDir, ".sidekick-cache-single");
result = runNode(["add", "--repo", repoTempSingle, "--cache-dir", cacheDirSingle]);
assert(result.status === 0, result.stderr || "add --repo (single skill) should succeed");
const configAfterSingle = JSON.parse(fs.readFileSync(configPath, "utf8"));
const expectedRepoDirSingle = path.join(cacheDirSingle, repoNameSingle);
assert(configAfterSingle.moduleDirs.includes(expectedRepoDirSingle), "moduleDirs should include single-skill repo path");
assert(configAfterSingle.modules.includes("solo-skill"), "modules should include solo-skill");

// Negative: multiple skills without --skill should fail
const repoTempMulti = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-skill-repo-multi-"));
const skillOne = path.join(repoTempMulti, "skill-one");
const skillTwo = path.join(repoTempMulti, "skill-two");
fs.mkdirSync(path.join(skillOne, "snippets"), { recursive: true });
fs.mkdirSync(path.join(skillTwo, "snippets"), { recursive: true });
fs.writeFileSync(path.join(skillOne, "SKILL.md"), "---\nname: skill-one\ndescription: One\n---\n");
fs.writeFileSync(path.join(skillTwo, "SKILL.md"), "---\nname: skill-two\ndescription: Two\n---\n");
fs.writeFileSync(path.join(skillOne, "sidekick.module.json"), JSON.stringify({ name: "skill-one" }, null, 2) + "\n");
fs.writeFileSync(path.join(skillTwo, "sidekick.module.json"), JSON.stringify({ name: "skill-two" }, null, 2) + "\n");
fs.writeFileSync(path.join(skillOne, "playbook.md"), "# One\n");
fs.writeFileSync(path.join(skillTwo, "playbook.md"), "# Two\n");
fs.writeFileSync(path.join(skillOne, "snippets", "kernel.md"), "- One rule\n");
fs.writeFileSync(path.join(skillTwo, "snippets", "kernel.md"), "- Two rule\n");
const cacheDirMulti = path.join(tempDir, ".sidekick-cache-multi");
result = runNode(["add", "--repo", repoTempMulti, "--cache-dir", cacheDirMulti]);
assert(result.status !== 0, "add --repo should fail when multiple skills exist without --skill");
const expectedRepoDirMulti = path.join(cacheDirMulti, path.basename(repoTempMulti));
assert(!fs.existsSync(expectedRepoDirMulti), "cache dir should be cleaned up after failed multi-skill install");

// Negative: missing skill name should fail
result = runNode(["add", "--repo", repoTempMulti, "--skill", "missing-skill", "--cache-dir", cacheDirMulti]);
assert(result.status !== 0, "add --repo should fail when --skill is not found");
assert(!fs.existsSync(expectedRepoDirMulti), "cache dir should be cleaned up after missing skill");

// Negative: repo with no SKILL.md should fail
const repoTempEmpty = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-skill-repo-empty-"));
const cacheDirEmpty = path.join(tempDir, ".sidekick-cache-empty");
result = runNode(["add", "--repo", repoTempEmpty, "--cache-dir", cacheDirEmpty]);
assert(result.status !== 0, "add --repo should fail when no skills are present");

// Add repo: local path with slash should still be treated as local
const nestedLocal = path.join(tempDir, "nested", "local-repo");
fs.mkdirSync(path.join(nestedLocal, "nested-skill", "snippets"), { recursive: true });
fs.writeFileSync(path.join(nestedLocal, "nested-skill", "SKILL.md"), "---\nname: nested-skill\ndescription: Nested\n---\n");
fs.writeFileSync(path.join(nestedLocal, "nested-skill", "sidekick.module.json"), JSON.stringify({ name: "nested-skill" }, null, 2) + "\n");
fs.writeFileSync(path.join(nestedLocal, "nested-skill", "playbook.md"), "# Nested\n");
fs.writeFileSync(path.join(nestedLocal, "nested-skill", "snippets", "kernel.md"), "- Nested rule\n");
const cacheDirLocal = path.join(tempDir, ".sidekick-cache-local");
const localRepoPath = path.join("nested", "local-repo");
result = runNode(["add", "--repo", localRepoPath, "--skill", "nested-skill", "--cache-dir", cacheDirLocal]);
assert(result.status === 0, result.stderr || "add --repo should treat local path with slash as local");
