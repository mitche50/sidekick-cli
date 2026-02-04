import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTempDir, writeModule } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("../packages/sidekick-cli/bin/sidekick.js");
const corePath = require.resolve("../packages/sidekick-core/index.js");
const adaptersPath = require.resolve("../packages/sidekick-core/adapters/index.js");
const repoInstallPath = require.resolve("../packages/sidekick-cli/bin/repo-install.js");

function loadModules() {
  delete require.cache[cliPath];
  delete require.cache[corePath];
  delete require.cache[adaptersPath];
  delete require.cache[repoInstallPath];
  const cli = require(cliPath);
  const core = require(corePath);
  const adapters = require(adaptersPath);
  const repoInstall = require(repoInstallPath);
  return { cli, core, adapters, repoInstall };
}

describe("cjs require coverage", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("loads modules via require and executes helpers", () => {
    const { cli, core, adapters } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-cjs");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-cjs"];
    core.saveConfig(root, cfg);
    const modules = cli.resolveConfiguredModules(root, cfg);
    expect(modules[0].name).toBe("mod-cjs");
    const registry = adapters.adapterRegistry();
    const enabled = adapters.getEnabledAdapters({ adapters: { aiderConf: true } }, registry);
    expect(enabled.length).toBeGreaterThan(0);
  });

  it("covers repo-install helpers", () => {
    const { repoInstall } = loadModules();
    const temp = makeTempDir();
    const localSpec = repoInstall.resolveRepoSpec(temp);
    expect(localSpec.type).toBe("local");
    const ghSpec = repoInstall.resolveRepoSpec("owner/repo");
    expect(ghSpec.type).toBe("github");
    const metaDir = makeTempDir();
    expect(repoInstall.readInstallMetadata(metaDir)).toBeNull();
    fs.writeFileSync(path.join(metaDir, ".sidekick-install.json"), "{bad");
    expect(repoInstall.readInstallMetadata(metaDir)).toBeNull();
    fs.mkdirSync(path.join(metaDir, "child"));
    fs.writeFileSync(path.join(metaDir, "child", "SKILL.md"), "x");
    expect(repoInstall.discoverSkills(metaDir)).toContain("child");
  });

  it("covers core internals and default config", () => {
    const { core } = loadModules();
    const root = makeTempDir();
    const jsonPath = path.join(root, "data.json");
    core._internal.writeJson(jsonPath, { ok: true });
    expect(core._internal.readJson(jsonPath).ok).toBe(true);
    expect(core._internal.normalizeNewlines("a\r\nb")).toBe("a\nb");
    expect(core._internal.isManagedGeminiSettingsContent("{\"contextFileName\":\"AGENTS.md\"}")).toBe(true);
    expect(core._internal.stripAgentsHeader("# AGENTS.md\n\nHello\n")).toBe("Hello\n");
    expect(core._internal.isSafeAdapterFilename("A\\B")).toBe(false);
    expect(core._internal.formatIndexPath(root, path.join(root, "x.txt"))).toBe("x.txt");
    expect(core._internal.resolveModuleSearchDirs(root, {}).length).toBeGreaterThan(0);
    expect(core.defaultConfig().budgets.indexMaxBytes).toBe(12000);
  });

  it("covers gitHeadForPath and extractSources", () => {
    const { core } = loadModules();
    const root = makeTempDir();
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "a.txt"), "x");
    spawnSync("git", ["add", "a.txt"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["-c", "user.name=Sidekick", "-c", "user.email=sidekick@example.com", "commit", "-m", "init"], {
      cwd: root,
      stdio: "ignore"
    });
    const head = core._internal.gitHeadForPath(root);
    expect(head === null || typeof head === "string").toBe(true);
    expect(core.extractSources("Sources consulted: a, b")).toEqual(["a", "b"]);
  });

  it("covers cli commands with require instance", async () => {
    const { cli, core } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-cli");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-cli"];
    core.saveConfig(root, cfg);
    const cwd = process.cwd();
    process.chdir(root);
    cli.usage();
    cli.toRegex("**/*.md");
    cli.commandBuild();
    cli.commandAdd(["mod-cli"]);
    cli.commandList();
    cli.commandReport();
    cli.commandTrace(["module", "mod-cli", "--files", "x.txt"]);
    cli.commandPromote(["mod-cli", "--dry-run"]);
    cli.commandRemove("mod-cli");

    const repo = makeTempDir();
    const repoSkills = path.join(repo, "skills");
    fs.mkdirSync(repoSkills, { recursive: true });
    writeModule(repoSkills, "install-me");
    const target = path.join(root, ".agents", "skills");
    cli.commandUpdate(["--repo", repo, "--dir", target]);
    process.chdir(cwd);
    expect(fs.existsSync(path.join(target, ".sidekick-install.json"))).toBe(true);
  });

  it("covers commandRun caps, stderr handling, and signal exits", async () => {
    const { core } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-run");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-run"];
    core.saveConfig(root, cfg);
    const childProcess = require("child_process");
    const originalSpawn = childProcess.spawn;
    const fakeChild = new EventEmitter();
    fakeChild.stdout = new PassThrough();
    fakeChild.stderr = new PassThrough();
    childProcess.spawn = () => fakeChild;
    delete require.cache[cliPath];
    const cliMocked = require(cliPath);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const cwd = process.cwd();
    process.chdir(root);
    cliMocked.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
    const playbook = path.join(skillsRoot, "mod-run", "playbook.md");
    const big = "x".repeat(70000);
    fakeChild.stdout.write(big);
    fakeChild.stderr.write("err\n");
    fakeChild.stdout.write(`Sources consulted: ${playbook}`);
    fakeChild.emit("close", null, "SIGINT");
    await new Promise((resolve) => setImmediate(resolve));
    process.chdir(cwd);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    childProcess.spawn = originalSpawn;
  });

  it("covers commandRun allow-missing when no sources are reported", async () => {
    const { core } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-run2");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-run2"];
    core.saveConfig(root, cfg);
    const childProcess = require("child_process");
    const originalSpawn = childProcess.spawn;
    const fakeChild = new EventEmitter();
    fakeChild.stdout = new PassThrough();
    fakeChild.stderr = new PassThrough();
    childProcess.spawn = () => fakeChild;
    delete require.cache[cliPath];
    const cliMocked = require(cliPath);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const cwd = process.cwd();
    process.chdir(root);
    cliMocked.commandRun(["--allow-missing", "--", "node", "-e", ""]);
    fakeChild.emit("close", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    process.chdir(cwd);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    childProcess.spawn = originalSpawn;
  });

  it("covers commandRun mapping failures and non-zero exit", async () => {
    const { core } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-run3");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-run3"];
    core.saveConfig(root, cfg);
    const outside = path.join(root, "outside.txt");
    fs.writeFileSync(outside, "x");
    const childProcess = require("child_process");
    const originalSpawn = childProcess.spawn;
    const fakeChild = new EventEmitter();
    fakeChild.stdout = new PassThrough();
    fakeChild.stderr = new PassThrough();
    childProcess.spawn = () => fakeChild;
    delete require.cache[cliPath];
    const cliMocked = require(cliPath);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const cwd = process.cwd();
    process.chdir(root);
    cliMocked.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
    fakeChild.stdout.write(`Sources consulted: ${outside}`);
    fakeChild.emit("close", 2, null);
    await new Promise((resolve) => setImmediate(resolve));
    process.chdir(cwd);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    childProcess.spawn = originalSpawn;
  });

  it("covers commandRun non-zero exit after successful mapping", async () => {
    const { core } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-run4");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-run4"];
    core.saveConfig(root, cfg);
    const childProcess = require("child_process");
    const originalSpawn = childProcess.spawn;
    const fakeChild = new EventEmitter();
    fakeChild.stdout = new PassThrough();
    fakeChild.stderr = new PassThrough();
    childProcess.spawn = () => fakeChild;
    delete require.cache[cliPath];
    const cliMocked = require(cliPath);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const cwd = process.cwd();
    process.chdir(root);
    cliMocked.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
    const playbook = path.join(skillsRoot, "mod-run4", "playbook.md");
    fakeChild.stdout.write(`Sources consulted: ${playbook}\n`);
    fakeChild.emit("close", 2, null);
    await new Promise((resolve) => setImmediate(resolve));
    process.chdir(cwd);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    childProcess.spawn = originalSpawn;
  });

  it("covers repoRoot, parseFrontmatter, and listModules", () => {
    const { cli, core } = loadModules();
    const root = makeTempDir();
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested, { recursive: true });
    const cwd = process.cwd();
    process.chdir(nested);
    expect(fs.realpathSync(cli.repoRoot()).toLowerCase()).toBe(fs.realpathSync(root).toLowerCase());
    process.chdir(cwd);
    const fm = cli.parseFrontmatter("---\nname: x\n---\n");
    expect(fm.name).toBe("x");
    expect(cli.parseFrontmatter("no frontmatter")).toEqual({});
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-list", { description: "desc" });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    const mods = cli.listModules(root, cfg);
    expect(mods[0].id).toBe("mod-list");
    const untracked = path.join(root, "untracked.txt");
    fs.writeFileSync(untracked, "x");
    const gitignore = path.join(root, ".gitignore");
    fs.writeFileSync(gitignore, "node_modules/\n");
    cli.ensureGitignore(root);
    expect(fs.readFileSync(gitignore, "utf8")).toContain(".sidekick/telemetry/");
    expect(cli.matchesPattern("docs/readme.md", "**/*.md")).toBe(true);
    const changeInfo = cli.collectChangedFiles(root);
    if (changeInfo.gitAvailable) {
      expect(Array.isArray(changeInfo.files)).toBe(true);
      expect(changeInfo.files).toContain("untracked.txt");
    }
    expect(cli.triggerMatches({ keywords: ["readme"] }, ["README.md"])).toBe(true);
    expect(cli.moduleIsExpected({ manifest: { triggers: [] } }, [])).toBe(true);
  });

  it("covers commandList and report branches", () => {
    const { cli, core } = loadModules();
    const root = makeTempDir();
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-report", {
      description: "Report module",
      manifest: { name: "mod-report", triggers: [{ keywords: ["nevermatch"] }] }
    });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-report"];
    core.saveConfig(root, cfg);
    fs.writeFileSync(path.join(root, "file.txt"), "x");
    const cwd = process.cwd();
    process.chdir(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandList();
    cli.commandReport();
    logSpy.mockRestore();
    process.chdir(cwd);
  });

  it("covers commandInit prompt branches", async () => {
    const { cli } = loadModules();
    const root = makeTempDir();
    const home = makeTempDir();
    const osModule = require("os");
    const originalHome = osModule.homedir;
    osModule.homedir = () => home;
    const readline = require("readline");
    const originalCreate = readline.createInterface;
    readline.createInterface = () => ({
      question: (prompt, cb) => cb("y"),
      close: () => {}
    });
    const repoInstall = require(repoInstallPath);
    const originalInstall = repoInstall.installSkillsToDir;
    repoInstall.installSkillsToDir = () => {
      throw new Error("boom");
    };
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const cwd = process.cwd();
    process.chdir(root);
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    cli.commandInit();
    readline.createInterface = originalCreate;
    repoInstall.installSkillsToDir = originalInstall;
    osModule.homedir = originalHome;
    exitSpy.mockRestore();
    process.chdir(cwd);
  });

  it("covers commandTrace logging and pickModuleForPromotion", () => {
    const { cli, core } = loadModules();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-trace");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-trace"];
    core.saveConfig(root, cfg);
    const cwd = process.cwd();
    process.chdir(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandTrace(["module", "mod-trace", "--files", "playbook.md"]);
    core.appendTelemetry(root, { module: "mod-trace", ts: new Date().toISOString() });
    cli.commandPromote([]);
    logSpy.mockRestore();
    process.chdir(cwd);
  });
});
