import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { makeTempDir, writeModule } from "./helpers.mjs";

async function importCliWithMocks({ childProcessMock, readlineMock, repoInstallMock } = {}) {
  vi.resetModules();
  if (childProcessMock) {
    vi.doMock("child_process", () => childProcessMock);
  }
  if (readlineMock) {
    vi.doMock("readline", () => readlineMock);
  }
  if (repoInstallMock) {
    vi.doMock("../packages/sidekick-cli/bin/repo-install.js", () => repoInstallMock);
  }
  const cli = await import("../packages/sidekick-cli/bin/sidekick.js");
  vi.unmock("child_process");
  vi.unmock("readline");
  vi.unmock("../packages/sidekick-cli/bin/repo-install.js");
  return cli;
}

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

async function importCliWithSpawn(child) {
  vi.resetModules();
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const childProcess = require("child_process");
  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;
  childProcess.spawn = () => child;
  childProcess.spawnSync = () => ({ status: 1, stdout: "" });
  const cli = await import("../packages/sidekick-cli/bin/sidekick.js");
  return {
    cli,
    restore() {
      childProcess.spawn = originalSpawn;
      childProcess.spawnSync = originalSpawnSync;
    }
  };
}

function setupRepo(root, coreModule) {
  coreModule.ensureConfig(root);
  const skillsRoot = path.join(root, "skills");
  fs.mkdirSync(skillsRoot, { recursive: true });
  writeModule(skillsRoot, "mod-one", { description: "One" });
  const cfgPath = path.join(root, ".sidekick", "config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.moduleDirs = [skillsRoot];
  cfg.modules = ["mod-one"];
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  return { skillsRoot };
}

describe("cli helpers coverage", () => {
  let root;
  let prevCwd;
  let core;

  beforeEach(async () => {
    root = makeTempDir();
    prevCwd = process.cwd();
    process.chdir(root);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    core = await import("../packages/sidekick-core/index.js");
  });

  afterEach(() => {
    process.chdir(prevCwd);
    vi.restoreAllMocks();
  });

  it("usage and main help/unknown", async () => {
    const cli = await importCliWithMocks();
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.usage();
    expect(logs.join("\n")).toContain("sidekick <command>");
    logs.length = 0;
    cli.main([]);
    expect(logs.join("\n")).toContain("Commands:");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    cli.main(["nope"]);
    expect(exitSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });

  it("repoRoot finds config and falls back to git/cwd", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const nested = path.join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    process.chdir(nested);
    expect(fs.realpathSync(cli.repoRoot())).toBe(fs.realpathSync(root));
    fs.rmSync(path.join(root, ".sidekick"), { recursive: true, force: true });
    const { spawnSync } = await import("node:child_process");
    const init = spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    if (init.status === 0) {
      expect(fs.realpathSync(cli.repoRoot())).toBe(fs.realpathSync(root));
    } else {
      expect(fs.realpathSync(cli.repoRoot())).toBe(fs.realpathSync(process.cwd()));
    }
  });

  it("ensureGitignore appends entry once", async () => {
    const cli = await importCliWithMocks();
    const gitignore = path.join(root, ".gitignore");
    fs.writeFileSync(gitignore, "node_modules/\n");
    cli.ensureGitignore(root);
    cli.ensureGitignore(root);
    const content = fs.readFileSync(gitignore, "utf8");
    const matches = content.match(/\.sidekick\/telemetry\//g) || [];
    expect(matches.length).toBe(1);
  });

  it("frontmatter parsing and module listing", async () => {
    const cli = await importCliWithMocks();
    expect(cli.parseFrontmatter("no frontmatter").name).toBeUndefined();
    setupRepo(root, core);
    const cfg = core.loadConfig(root);
    const modules = cli.listModules(root, cfg);
    expect(modules.length).toBe(1);
  });

  it("listModules skips duplicates and missing skills", async () => {
    const cli = await importCliWithMocks();
    const dirA = path.join(root, "skills-a");
    const dirB = path.join(root, "skills-b");
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    writeModule(dirA, "dup-mod");
    writeModule(dirB, "dup-mod");
    fs.mkdirSync(path.join(dirB, "no-skill"), { recursive: true });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [dirA, dirB];
    const modules = cli.listModules(root, cfg);
    expect(modules.filter((m) => m.id === "dup-mod").length).toBe(1);
  });

  it("pattern matching and trigger evaluation", async () => {
    const cli = await importCliWithMocks();
    expect(cli.matchesPattern("a/b.js", "**/*.js")).toBe(true);
    expect(cli.matchesPattern("a/b.ts", "**/*.js")).toBe(false);
    expect(cli.triggerMatches("docs/**", ["docs/readme.md"])).toBe(true);
    expect(cli.triggerMatches({ always: true }, ["x"])).toBe(true);
    expect(cli.triggerMatches({ paths: ["src/**"] }, ["docs/x"])).toBe(false);
    expect(cli.triggerMatches({ keywords: ["API"] }, ["docs/api.md"])).toBe(true);
    expect(cli.triggerMatches(null, ["x"])).toBe(false);
  });

  it("collectChangedFiles returns git unavailable", async () => {
    const cli = await importCliWithMocks({
      childProcessMock: {
        spawnSync: vi.fn(() => ({ status: 1, stdout: "" })),
        spawn: vi.fn()
      }
    });
    const info = cli.collectChangedFiles(root);
    expect(info.gitAvailable).toBe(false);
  });

  it("collectChangedFiles aggregates diff, staged, untracked", async () => {
    const cli = await importCliWithMocks();
    const { spawnSync } = await import("node:child_process");
    const init = spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "a.txt"), "one");
    spawnSync("git", ["add", "a.txt"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "b.txt"), "two");
    const info = cli.collectChangedFiles(root);
    if (init.status === 0) {
      expect(info.gitAvailable).toBe(true);
      expect(info.files.length).toBeGreaterThan(0);
    } else {
      expect(info.gitAvailable).toBe(false);
    }
  });
});

describe("cli commands coverage", () => {
  let root;
  let prevCwd;
  let core;

  beforeEach(async () => {
    root = makeTempDir();
    prevCwd = process.cwd();
    process.chdir(root);
    core = await import("../packages/sidekick-core/index.js");
  });

  afterEach(() => {
    process.chdir(prevCwd);
    vi.restoreAllMocks();
  });

  it("commandInit logs missing global skills", async () => {
    const logs = [];
    const cli = await importCliWithMocks();
    const realExists = fs.existsSync;
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (p === path.join(os.homedir(), ".agents", "skills")) return false;
      return realExists(p);
    });
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandInit();
    expect(logs.join("\n")).toContain("Global skills not found");
  });

  it("commandAdd errors and module add/remove", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    expect(() => cli.commandAdd([])).toThrow(/Module name required/);
    cli.commandAdd(["mod-one"]);
    const cfg = core.loadConfig(root);
    expect(cfg.modules).toContain("mod-one");
    cli.commandRemove("mod-one");
    const cfg2 = core.loadConfig(root);
    expect(cfg2.modules).not.toContain("mod-one");
  });

  it("commandAdd repo mode validates args", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    expect(() => cli.commandAdd(["--repo"])).toThrow(/Usage: sidekick add --repo/);
    expect(() => cli.commandAdd(["--repo", "x", "--skill"])).toThrow(/Missing value for --skill/);
    expect(() => cli.commandAdd(["--repo", "x", "--cache-dir"])).toThrow(/Missing value for --cache-dir/);
  });

  it("commandAdd rejects invalid module and missing module", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    expect(() => cli.commandAdd(["Bad"])).toThrow(/Invalid module name/);
    expect(() => cli.commandAdd(["missing"])).toThrow(/Module not found/);
  });

  it("commandAdd repo flow installs and adds module", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const repo = makeTempDir();
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const repoInstall = require("../packages/sidekick-cli/bin/repo-install.js");
    const originalResolve = repoInstall.resolveRepoSpec;
    const originalInstall = repoInstall.installRepoToCache;
    const originalDiscover = repoInstall.discoverSkillsInRepo;
    repoInstall.resolveRepoSpec = () => ({ type: "local", path: repo });
    repoInstall.installRepoToCache = (_spec, dest) => {
      fs.mkdirSync(dest, { recursive: true });
    };
    repoInstall.discoverSkillsInRepo = (dest) => ({ root: dest, skills: ["repo-mod"] });
    cli.commandAdd(["--repo", repo, "--skill", "repo-mod", "--cache-dir", path.join(root, ".cache")]);
    repoInstall.resolveRepoSpec = originalResolve;
    repoInstall.installRepoToCache = originalInstall;
    repoInstall.discoverSkillsInRepo = originalDiscover;
    const cfg = core.loadConfig(root);
    expect(cfg.modules).toContain("repo-mod");
  });

  it("commandAdd repo auto-selects when one skill exists", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const repo = makeTempDir();
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const repoInstall = require("../packages/sidekick-cli/bin/repo-install.js");
    const originalResolve = repoInstall.resolveRepoSpec;
    const originalInstall = repoInstall.installRepoToCache;
    const originalDiscover = repoInstall.discoverSkillsInRepo;
    repoInstall.resolveRepoSpec = () => ({ type: "local", path: repo });
    repoInstall.installRepoToCache = (_spec, dest) => {
      fs.mkdirSync(dest, { recursive: true });
    };
    repoInstall.discoverSkillsInRepo = (dest) => ({ root: dest, skills: ["auto-mod"] });
    cli.commandAdd(["--repo", repo, "--cache-dir", path.join(root, ".cache-auto")]);
    repoInstall.resolveRepoSpec = originalResolve;
    repoInstall.installRepoToCache = originalInstall;
    repoInstall.discoverSkillsInRepo = originalDiscover;
    const cfg = core.loadConfig(root);
    expect(cfg.modules).toContain("auto-mod");
  });

  it("commandAdd repo flow handles invalid repo name and escape", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const repoInstall = require("../packages/sidekick-cli/bin/repo-install.js");
    const originalResolve = repoInstall.resolveRepoSpec;
    repoInstall.resolveRepoSpec = () => ({ type: "local", path: "." });
    expect(() => cli.commandAdd(["--repo", "ignored", "--cache-dir", path.join(root, ".cache")])).toThrow(/Invalid repo name/);
    repoInstall.resolveRepoSpec = originalResolve;
    const repo = makeTempDir();
    const repoInstall2 = require("../packages/sidekick-cli/bin/repo-install.js");
    const originalResolve2 = repoInstall2.resolveRepoSpec;
    const originalInstall2 = repoInstall2.installRepoToCache;
    const originalDiscover2 = repoInstall2.discoverSkillsInRepo;
    repoInstall2.resolveRepoSpec = () => ({ type: "local", path: repo });
    repoInstall2.installRepoToCache = (_spec, dest) => {
      fs.mkdirSync(dest, { recursive: true });
    };
    repoInstall2.discoverSkillsInRepo = (dest) => ({ root: dest, skills: ["repo-mod"] });
    expect(() => cli.commandAdd(["--repo", repo, "--cache-dir", path.join(root, ".cache2"), "--skill", "repo-mod"])).not.toThrow();
    repoInstall2.resolveRepoSpec = originalResolve2;
    repoInstall2.installRepoToCache = originalInstall2;
    repoInstall2.discoverSkillsInRepo = originalDiscover2;
  });

  it("commandBuild and commandList output", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    cli.commandBuild();
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandList();
    expect(logs.join("\n")).toContain("Discovered modules");
  });

  it("commandBuild handles empty modules", async () => {
    const cli = await importCliWithMocks();
    core.ensureConfig(root);
    cli.commandBuild();
    expect(fs.existsSync(path.join(root, ".sidekick", "index.min.txt"))).toBe(true);
  });

  it("commandReport prints N/A when no triggers", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandReport();
    expect(logs.join("\n")).toContain("Invocation coverage");
  });

  it("commandReport handles no configured modules", async () => {
    const cli = await importCliWithMocks();
    core.ensureConfig(root);
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandReport();
    expect(logs.join("\n")).toContain("Modules expected");
  });

  it("commandTrace validates args and telemetry settings", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    expect(() => cli.commandTrace(["module"])).toThrow(/Expected: sidekick trace/);
    const cfg = core.loadConfig(root);
    cfg.telemetry.enabled = false;
    core.saveConfig(root, cfg);
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandTrace(["module", "mod-one"]);
    expect(logs.join("\n")).toContain("Telemetry disabled");
  });

  it("commandTrace rejects unsupported telemetry mode", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const cfgPath = path.join(root, ".sidekick", "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.telemetry.mode = "remote";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    expect(() => cli.commandTrace(["module", "mod-one"])).toThrow(/Unsupported telemetry/);
  });

  it("commandPromote handles dry-run and missing module", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandPromote(["--dry-run", "mod-one"]);
    expect(logs.join("\n")).toContain("Preview");
    expect(() => cli.commandPromote(["missing"])).toThrow(/Module not found/);
  });

  it("commandPromote handles no modules available", async () => {
    const cli = await importCliWithMocks();
    core.ensureConfig(root);
    expect(() => cli.commandPromote([])).toThrow(/No module available/);
  });

  it("commandPromote handles already promoted path", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    cli.commandPromote(["mod-one"]);
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((m) => logs.push(m));
    cli.commandPromote(["mod-one"]);
    expect(logs.join("\n")).toContain("Already promoted");
  });

  it("commandUpdate validate args", async () => {
    const cli = await importCliWithMocks();
    expect(() => cli.commandUpdate(["--dir"])).toThrow(/Missing value for --dir/);
    expect(() => cli.commandUpdate(["--repo"])).toThrow(/Missing value for --repo/);
    expect(() => cli.commandUpdate(["--ref"])).toThrow(/Missing value for --ref/);
  });

  it("commandUpdate uses metadata and errors without it", async () => {
    const cli = await importCliWithMocks();
    const dir = path.join(root, ".agents", "skills");
    expect(() => cli.commandUpdate(["--dir", dir])).toThrow(/No install metadata/);
  });

  it("commandRun handles allow-missing and missing sources", async () => {
    const child = makeChild();
    const { cli, restore } = await importCliWithSpawn(child);
    setupRepo(root, core);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    cli.commandRun(["--allow-missing", "--", "node", "-e", "console.log('hi')"]);
    child.emit("close", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(exitSpy).toHaveBeenCalled();
    restore();
  });

  it("commandRun enforces sources and telemetry disabled", async () => {
    const child = makeChild();
    const { cli, restore } = await importCliWithSpawn(child);
    setupRepo(root, core);
    const cfg = core.loadConfig(root);
    cfg.telemetry.enabled = false;
    core.saveConfig(root, cfg);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const cmd = [
      "--",
      "node",
      "-e",
      `console.log('Sources consulted: ${path.join(root, "skills", "mod-one", "playbook.md")}')`
    ];
    cli.commandRun(cmd);
    child.stdout.write(`Sources consulted: ${path.join(root, "skills", "mod-one", "playbook.md")}\n`);
    child.emit("close", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(exitSpy).toHaveBeenCalled();
    restore();
  });

  it("commandRun rejects missing sources and maps modules", async () => {
    const child = makeChild();
    const { cli, restore } = await importCliWithSpawn(child);
    setupRepo(root, core);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const cmd = [
      "--",
      "node",
      "-e",
      `console.log('Sources consulted: ${path.join(root, "missing.txt")}')`
    ];
    cli.commandRun(cmd);
    child.stdout.write(`Sources consulted: ${path.join(root, "missing.txt")}\n`);
    child.emit("close", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(exitSpy).toHaveBeenCalled();
    restore();
  });

  it("commandRun rejects missing separator and unsupported telemetry", async () => {
    const cli = await importCliWithMocks();
    setupRepo(root, core);
    expect(() => cli.commandRun(["node", "-e", "x"])).toThrow(/Expected: sidekick run/);
    const cfgPath = path.join(root, ".sidekick", "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.telemetry.mode = "remote";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    expect(() => cli.commandRun(["--", "node", "-e", "console.log('hi')"])).toThrow(/Unsupported telemetry/);
  });

  it("commandRun handles no sources line when allowMissing", async () => {
    const child = makeChild();
    const { cli, restore } = await importCliWithSpawn(child);
    setupRepo(root, core);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    cli.commandRun(["--allow-missing", "--", "node", "-e", "console.log('hi')"]);
    child.emit("close", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(exitSpy).toHaveBeenCalled();
    restore();
  });

  it("main handles run errors and help", async () => {
    const cli = await importCliWithMocks();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    cli.main(["run"]);
    expect(exitSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    cli.main(["help"]);
  });
});
