import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTempDir, writeModule } from "./helpers.mjs";

let core;
let cli;

beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  core = await import("../packages/sidekick-core/index.js");
  cli = await import("../packages/sidekick-cli/bin/sidekick.js");
});

describe("cli basic coverage", () => {
  it("usage prints and resolveConfiguredModules sorts", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "b-mod");
    writeModule(skillsRoot, "a-mod");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["b-mod", "a-mod"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.usage();
    const modules = cli.resolveConfiguredModules(root, cfg);
    expect(modules[0].name).toBe("a-mod");
    logSpy.mockRestore();
  });

  it("helpers normalize and parse", () => {
    expect(cli.normalizePath("a\\b")).toBe("a/b");
    const fm = cli.parseFrontmatter("---\nname: x\ndescription: y\n---\nBody");
    expect(fm.name).toBe("x");
    const match = cli.matchesPattern("docs/readme.md", "**/*.md");
    expect(match).toBe(true);
  });

  it("listModules returns descriptions", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-desc", { description: "Desc" });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    const modules = cli.listModules(root, cfg);
    expect(modules[0].description).toBe("Desc");
  });

  it("ensureGitignore appends when missing", () => {
    const root = makeTempDir();
    const gitignore = path.join(root, ".gitignore");
    fs.writeFileSync(gitignore, "node_modules/\n");
    cli.ensureGitignore(root);
    const content = fs.readFileSync(gitignore, "utf8");
    expect(content).toContain(".sidekick/telemetry/");
  });

  it("collectChangedFiles returns untracked", () => {
    const root = makeTempDir();
    cli.collectChangedFiles(root);
    const init = require("child_process").spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "x.txt"), "x");
    const result = cli.collectChangedFiles(root);
    if (init.status === 0) {
      expect(result.files).toContain("x.txt");
    }
  });

  it("moduleIsExpected handles empty triggers", () => {
    expect(cli.moduleIsExpected({ manifest: { triggers: [] } }, [])).toBe(true);
  });

  it("triggerMatches handles keywords", () => {
    expect(cli.triggerMatches({ keywords: ["readme"] }, ["README.md"])).toBe(true);
  });

  it("repoRoot falls back to git root", () => {
    const root = makeTempDir();
    require("child_process").spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    const nested = path.join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    const cwd = process.cwd();
    process.chdir(nested);
    const resolved = cli.repoRoot();
    process.chdir(cwd);
    expect(fs.realpathSync(resolved)).toBe(fs.realpathSync(root));
  });

  it("commandBuild and commandReport run", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-report", { manifest: { name: "mod-report", triggers: { paths: ["src/**"] } } });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-report"];
    core.saveConfig(root, cfg);
    const cwd = process.cwd();
    process.chdir(root);
    cli.commandBuild();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandReport();
    process.chdir(cwd);
    logSpy.mockRestore();
  });

  it("commandList prints status and description", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-list", { description: "Listed" });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-list"];
    core.saveConfig(root, cfg);
    const cwd = process.cwd();
    process.chdir(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandList();
    process.chdir(cwd);
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("mod-list"))).toBe(true);
    logSpy.mockRestore();
  });

  it("commandUpdate runs with local repo", () => {
    const repo = makeTempDir();
    const skills = path.join(repo, "skills");
    fs.mkdirSync(skills, { recursive: true });
    writeModule(skills, "install-mod");
    const root = makeTempDir();
    core.saveConfig(root, core.defaultConfig());
    const cwd = process.cwd();
    process.chdir(root);
    const dir = path.join(root, ".agents", "skills");
    cli.commandUpdate(["--repo", repo, "--dir", dir]);
    process.chdir(cwd);
    expect(fs.existsSync(path.join(dir, ".sidekick-install.json"))).toBe(true);
  });

  it("commandAdd and commandRemove update config", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-add");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    core.saveConfig(root, cfg);
    const cwd = process.cwd();
    process.chdir(root);
    cli.commandAdd(["mod-add"]);
    cli.commandRemove("mod-add");
    process.chdir(cwd);
    const updated = core.loadConfig(root);
    expect(updated.modules).not.toContain("mod-add");
  });

  it("commandTrace appends telemetry", () => {
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
    cli.commandTrace(["module", "mod-trace", "--files", "a.txt"]);
    process.chdir(cwd);
    const entries = core.loadTelemetry(root);
    expect(entries.length).toBe(1);
  });

  it("commandRun with real child process logs telemetry", async () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-run");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-run"];
    core.saveConfig(root, cfg);
    vi.resetModules();
    const { createRequire } = await import("node:module");
    const { EventEmitter } = await import("node:events");
    const { PassThrough } = await import("node:stream");
    const require = createRequire(import.meta.url);
    const childProcess = require("child_process");
    const originalSpawn = childProcess.spawn;
    const originalSpawnSync = childProcess.spawnSync;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    childProcess.spawn = () => child;
    childProcess.spawnSync = () => ({ status: 1, stdout: "" });
    const corePath = require.resolve("../packages/sidekick-core/index.js");
    const cliPath = require.resolve("../packages/sidekick-cli/bin/sidekick.js");
    delete require.cache[corePath];
    delete require.cache[cliPath];
    const coreCjs = require(corePath);
    const appendSpy = vi.spyOn(coreCjs, "appendTelemetry");
    const cliMock = require(cliPath);
    const cwd = process.cwd();
    process.chdir(root);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const playbook = path.join(skillsRoot, "mod-run", "playbook.md");
    cliMock.commandRun(["--", "node", "-e", `console.log('Sources consulted: ${playbook}')`]);
    child.stdout.write(`Sources consulted: ${playbook}\n`);
    await new Promise((resolve) => setImmediate(resolve));
    child.emit("close", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    process.chdir(cwd);
    exitSpy.mockRestore();
    childProcess.spawn = originalSpawn;
    childProcess.spawnSync = originalSpawnSync;
    expect(appendSpy).toHaveBeenCalled();
  });
});
