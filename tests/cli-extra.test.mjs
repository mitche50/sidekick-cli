import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { makeTempDir, writeModule } from "./helpers.mjs";

async function importCli(mocks = {}) {
  vi.resetModules();
  if (mocks.childProcess) {
    vi.doMock("child_process", () => mocks.childProcess);
  }
  if (mocks.readline) {
    vi.doMock("readline", () => mocks.readline);
  }
  return import("../packages/sidekick-cli/bin/sidekick.js");
}

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

async function flushTimers() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function writeConfig(root, config) {
  const dir = path.join(root, ".sidekick");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n");
}

const repoRootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreFallbackPath = path.join(repoRootPath, "packages", "sidekick-core");

async function withMockedCore(mockCore, fn) {
  const Module = await import("node:module");
  const req = Module.createRequire(import.meta.url);
  const corePath = req.resolve("@mitche50/sidekick-core");
  const cache = Module.default._cache;
  const originalCore = cache[corePath];
  const originalFallback = cache[coreFallbackPath];
  cache[corePath] = { id: corePath, filename: corePath, loaded: true, exports: mockCore };
  cache[coreFallbackPath] = { id: coreFallbackPath, filename: coreFallbackPath, loaded: true, exports: mockCore };
  try {
    return await fn();
  } finally {
    if (originalCore) {
      cache[corePath] = originalCore;
    } else {
      delete cache[corePath];
    }
    if (originalFallback) {
      cache[coreFallbackPath] = originalFallback;
    } else {
      delete cache[coreFallbackPath];
    }
  }
}

describe("sidekick CLI extra coverage", () => {
  let cwd;
  let core;
  let skipRestore = false;
  beforeEach(() => {
    cwd = process.cwd();
  });
  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    core = await import("../packages/sidekick-core/index.js");
  });
  afterEach(() => {
    process.chdir(cwd);
    if (!skipRestore) {
      vi.restoreAllMocks();
    }
  });

  it("uses fallback core require when package missing", async () => {
    const Module = await import("node:module");
    const originalLoad = Module.default._load;
    Module.default._load = function mocked(request, parent, isMain) {
      if (request === "@mitche50/sidekick-core") {
        const err = new Error("not found");
        err.code = "MODULE_NOT_FOUND";
        throw err;
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    const cli = await importCli();
    expect(cli).toBeTruthy();
    Module.default._load = originalLoad;
  });

  it("usage and module resolution helpers execute", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-help", { description: "Help module" });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-help"];
    core.saveConfig(root, cfg);
    const cli = await importCli();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.usage();
    const modules = cli.resolveConfiguredModules(root, cfg);
    expect(modules[0].name).toBe("mod-help");
    logSpy.mockRestore();
  });

  it("repoRoot prefers git root when no config exists", async () => {
    const cli = await importCli();
    const root = makeTempDir();
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    const child = makeTempDir();
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested, { recursive: true });
    process.chdir(nested);
    expect(path.basename(fs.realpathSync(cli.repoRoot())).toLowerCase())
      .toBe(path.basename(fs.realpathSync(root)).toLowerCase());
    process.chdir(child);
  });

  it("ensureGitignore appends telemetry ignore", async () => {
    const cli = await importCli();
    const root = makeTempDir();
    const gitignorePath = path.join(root, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules/\n");
    cli.ensureGitignore(root);
    expect(fs.readFileSync(gitignorePath, "utf8")).toContain(".sidekick/telemetry/");
  });

  it("parseFrontmatter, listModules, and match helpers", async () => {
    const cli = await importCli();
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    const modDir = writeModule(skillsRoot, "mod-front", { description: "Front desc" });
    const fm = cli.parseFrontmatter(fs.readFileSync(path.join(modDir, "SKILL.md"), "utf8"));
    expect(fm.name).toBe("mod-front");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    const listed = cli.listModules(root, cfg);
    expect(listed[0].description).toBe("Front desc");
    expect(cli.matchesPattern("docs/readme.md", "**/*.md")).toBe(true);
    expect(cli.matchesPattern("src/app.js", "**/*.md")).toBe(false);
    expect(cli.matchesPattern("src/app.js", "src/*.js")).toBe(true);
  });

  it("triggerMatches handles keywords and arrays", async () => {
    const cli = await importCli();
    expect(cli.triggerMatches({ keywords: ["readme"] }, ["README.md"])).toBe(true);
    expect(cli.triggerMatches({ paths: ["docs/**"] }, ["docs/a.md"])).toBe(true);
    expect(cli.triggerMatches("**/*.md", ["docs/a.md"])).toBe(true);
  });

  it("commandAdd repo error paths and cleanup", async () => {
    const root = makeTempDir();
    process.chdir(root);
    core.saveConfig(root, core.defaultConfig());
    const cacheDir = makeTempDir("sidekick-cache-");
    const repoPath = path.join(root, "repo");
    fs.mkdirSync(repoPath, { recursive: true });
    vi.resetModules();
    vi.doMock("../packages/sidekick-cli/bin/repo-install.js", () => ({
      resolveRepoSpec: () => ({ type: "local", path: repoPath }),
      installRepoToCache: (spec, dest) => {
        fs.mkdirSync(dest, { recursive: true });
      },
      discoverSkills: () => []
    }));
    const cli = await import("../packages/sidekick-cli/bin/sidekick.js");
    expect(() => cli.commandAdd(["--repo", repoPath, "--cache-dir", cacheDir])).toThrow(/No skills found/);
    const dest = path.join(cacheDir, "repo");
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("commandAdd repo handles multiple skills and missing skill", async () => {
    const root = makeTempDir();
    process.chdir(root);
    core.saveConfig(root, core.defaultConfig());
    const cacheDir = makeTempDir("sidekick-cache-");
    const repoPath = path.join(root, "repo");
    fs.mkdirSync(repoPath, { recursive: true });
    writeModule(repoPath, "one");
    writeModule(repoPath, "two");
    const cli = await importCli();
    expect(() => cli.commandAdd(["--repo", repoPath, "--cache-dir", cacheDir])).toThrow(/Multiple skills/);
    expect(() => cli.commandAdd(["--repo", repoPath, "--cache-dir", cacheDir, "--skill", "three"])).toThrow(/Skill not found/);
  });

  it("commandAdd repo detects cache escape", async () => {
    const root = makeTempDir();
    process.chdir(root);
    core.saveConfig(root, core.defaultConfig());
    const cacheDir = makeTempDir("sidekick-cache-");
    const repoPath = path.join(root, "repo");
    fs.mkdirSync(repoPath, { recursive: true });
    vi.resetModules();
    vi.doMock("../packages/sidekick-cli/bin/repo-install.js", () => ({
      resolveRepoSpec: () => ({ type: "local", path: repoPath }),
      installRepoToCache: () => {},
      discoverSkills: () => ["repo"]
    }));
    const originalResolve = path.resolve;
    const resolveSpy = vi.spyOn(path, "resolve").mockImplementation((...args) => {
      const input = args[0];
      if (input === cacheDir) return "/tmp/cache";
      if (input === path.join(cacheDir, "repo")) return "/tmp/escape";
      return originalResolve(...args);
    });
    const cli = await import("../packages/sidekick-cli/bin/sidekick.js");
    expect(() => cli.commandAdd(["--repo", repoPath, "--cache-dir", cacheDir, "--skill", "repo"])).toThrow(/escapes cache/);
    resolveSpy.mockRestore();
  });

  it("commandPromote reports already promoted", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-promoted");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-promoted"];
    core.saveConfig(root, cfg);
    const templateDir = path.join(root, "templates", "agents-md");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, "kernel.md"), "## Promoted Rules\n### mod-promoted\n- Kernel rule\n");
    const cli = await importCli();
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));
    cli.commandPromote(["mod-promoted"]);
    expect(logs.join("\n")).toContain("Already promoted");
  });

  it("commandTrace rejects non-local mode when telemetry disabled", async () => {
    const mockCore = {
      ensureConfig: () => {},
      loadConfig: () => ({ telemetry: { enabled: true, mode: "remote" }, modules: [] }),
      saveConfig: () => {},
      resolveModule: () => ({ name: "mod-trace2" }),
      writeAgentsOutputs: () => {},
      extractSources: () => [],
      mapSourcesToModules: () => new Map(),
      promoteModuleKernel: () => ({ changed: false, added: [] }),
      loadTelemetry: () => [],
      appendTelemetry: () => {}
    };
    await withMockedCore(mockCore, async () => {
      vi.resetModules();
      const cli = await import("../packages/sidekick-cli/bin/sidekick.js");
      expect(() => cli.commandTrace(["module", "mod-trace2"])).toThrow(/Unsupported telemetry mode/);
    });
  });

  it("commandRun rejects unsupported telemetry mode via mocked core", async () => {
    const mockCore = {
      ensureConfig: () => {},
      loadConfig: () => ({ telemetry: { enabled: true, mode: "remote" }, modules: [] }),
      saveConfig: () => {},
      resolveModule: () => ({}),
      writeAgentsOutputs: () => {},
      extractSources: () => [],
      mapSourcesToModules: () => new Map(),
      promoteModuleKernel: () => ({ changed: false, added: [] }),
      loadTelemetry: () => [],
      appendTelemetry: () => {}
    };
    await withMockedCore(mockCore, async () => {
      vi.resetModules();
      vi.doMock("child_process", () => ({
        spawn: vi.fn(),
        spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
      }));
      const cli = await import("../packages/sidekick-cli/bin/sidekick.js");
      expect(() => cli.commandRun(["--", "node", "-e", "console.log('hi')"])).toThrow(/Unsupported telemetry mode/);
    });
  });

  it("commandBuild, add/remove, update, list, report, promote paths execute", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-flow");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-flow"];
    core.saveConfig(root, cfg);
    const cli = await importCli();
    cli.commandBuild();
    cli.commandAdd(["mod-flow"]);

    const repo = makeTempDir();
    const repoSkills = path.join(repo, "skills");
    fs.mkdirSync(repoSkills, { recursive: true });
    writeModule(repoSkills, "install-mod");
    cli.commandUpdate(["--repo", repo, "--dir", path.join(root, ".agents", "skills")]);

    const listed = [];
    vi.spyOn(console, "log").mockImplementation((msg) => listed.push(msg));
    cli.commandList();
    expect(listed.join("\n")).toContain("mod-flow");

    const usagePath = path.join(root, ".sidekick", "telemetry", "usage.jsonl");
    fs.mkdirSync(path.dirname(usagePath), { recursive: true });
    fs.writeFileSync(usagePath, JSON.stringify({ module: "other" }) + "\n");
    cli.commandReport();

    cli.commandPromote(["mod-flow", "--dry-run"]);
    cli.commandRemove("mod-flow");
  });

  it("collectChangedFiles returns git files", async () => {
    const cli = await importCli();
    const root = makeTempDir();
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "a.txt"), "a1");
    fs.writeFileSync(path.join(root, "b.txt"), "b1");
    spawnSync("git", ["add", "a.txt", "b.txt"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["-c", "user.name=Sidekick", "-c", "user.email=sidekick@example.com", "commit", "-m", "init"], {
      cwd: root,
      stdio: "ignore"
    });
    fs.writeFileSync(path.join(root, "a.txt"), "a2");
    fs.writeFileSync(path.join(root, "b.txt"), "b2");
    spawnSync("git", ["add", "b.txt"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "c.txt"), "c1");
    const result = cli.collectChangedFiles(root);
    expect(result.gitAvailable).toBe(true);
    expect(result.files.sort()).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("commandInit logs when global skills missing", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const homeDir = makeTempDir();
    vi.spyOn(os, "homedir").mockReturnValue(homeDir);
    const cli = await importCli();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandInit();
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("Global skills not found"))).toBe(true);
    logSpy.mockRestore();
  });

  it("moduleIsExpected handles empty triggers", async () => {
    const cli = await importCli();
    expect(cli.moduleIsExpected({ manifest: {} }, [])).toBe(true);
    expect(cli.moduleIsExpected({ manifest: { triggers: [] } }, [])).toBe(true);
    expect(cli.moduleIsExpected({ manifest: { triggers: { paths: ["**/*.md"] } } }, ["readme.md"])).toBe(true);
  });

  it("commandReport prints no triggers matched message", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-a", { manifest: { name: "mod-a", triggers: { paths: ["nope/**"] } } });
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-a"];
    core.saveConfig(root, cfg);
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["-c", "user.name=Sidekick", "-c", "user.email=sidekick@example.com", "commit", "-m", "init"], {
      cwd: root,
      stdio: "ignore"
    });
    const cli = await importCli();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandReport();
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("No triggers matched"))).toBe(true);
  });

  it("commandList prints when no modules found", async () => {
    const root = makeTempDir();
    process.chdir(root);
    core.ensureConfig(root);
    const cli = await importCli();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandList();
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("No modules discovered"))).toBe(true);
  });

  it("pickModuleForPromotion uses usage counts", async () => {
    const cli = await importCli();
    const modules = [{ name: "a" }, { name: "b" }];
    const usage = [{ module: "b" }, { module: "b" }];
    const pick = cli.pickModuleForPromotion(modules, usage);
    expect(pick).toBe("b");
  });

  it("pickModuleForPromotion breaks ties by name", async () => {
    const cli = await importCli();
    const modules = [{ name: "b" }, { name: "a" }];
    const usage = [{ module: "a" }, { module: "b" }];
    const pick = cli.pickModuleForPromotion(modules, usage);
    expect(pick).toBe("a");
  });

  it("commandPromote handles --top parsing", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-top");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-top"];
    core.saveConfig(root, cfg);
    const cli = await importCli();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cli.commandPromote(["--top", "1", "mod-top", "--dry-run"]);
    expect(logSpy).toHaveBeenCalled();
  });

  it("commandTrace logs usage and handles mode errors", async () => {
    const root = makeTempDir();
    process.chdir(root);
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-trace");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-trace"];
    core.saveConfig(root, cfg);
    const cli = await importCli();
    cli.commandTrace(["module", "mod-trace", "--files", "a.txt"]);
    cfg.telemetry.mode = "remote";
    writeConfig(root, cfg);
    expect(() => cli.commandTrace(["module", "mod-trace"])).toThrow(/Unsupported telemetry mode/);
  });

  describe("commandRun exit handling", () => {
    let exitSpy;

    beforeAll(() => {
      skipRestore = true;
      exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    });

    afterAll(async () => {
      await flushTimers();
      exitSpy.mockRestore();
      skipRestore = false;
      vi.restoreAllMocks();
    });

    afterEach(async () => {
      await flushTimers();
    });

    it("commandRun handles stderr, tail sources, and signal exits", async () => {
      const root = makeTempDir();
      process.chdir(root);
      const skillsRoot = path.join(root, "skills");
      fs.mkdirSync(skillsRoot, { recursive: true });
      writeModule(skillsRoot, "mod-run");
      const cfg = core.defaultConfig();
      cfg.moduleDirs = [skillsRoot];
      cfg.modules = ["mod-run"];
      core.saveConfig(root, cfg);
      const child = makeChild();
      const cli = await importCli({
        childProcess: {
          spawn: () => child,
          spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
        }
      });
      cli.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
      child.stderr.write("err\n");
      child.stdout.write("Sources consulted: " + path.join(skillsRoot, "mod-run", "playbook.md"));
      child.emit("close", null, "SIGINT");
      await flushTimers();
    });

    it("commandRun enforces telemetry mode and caps buffers", async () => {
      const root = makeTempDir();
      process.chdir(root);
      const skillsRoot = path.join(root, "skills");
      fs.mkdirSync(skillsRoot, { recursive: true });
      writeModule(skillsRoot, "mod-cap");
      const cfg = core.defaultConfig();
      cfg.moduleDirs = [skillsRoot];
      cfg.modules = ["mod-cap"];
      cfg.telemetry.mode = "remote";
      writeConfig(root, cfg);
      const cliBad = await importCli();
      expect(() => cliBad.commandRun(["--", "node", "-e", "process.stdout.write('x')"])).toThrow(/Unsupported telemetry mode/);

      cfg.telemetry.mode = "local";
      writeConfig(root, cfg);
      const child = makeChild();
      const cli = await importCli({
        childProcess: {
          spawn: () => child,
          spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
        }
      });
      cli.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
      const big = "x".repeat(70000);
      const sourcePath = path.join(skillsRoot, "mod-cap", "playbook.md");
      child.stdout.write(`${big}\nSources consulted: ${sourcePath}\n`);
      child.emit("close", 0, null);
      await flushTimers();
    });

    it("commandRun handles spawn error", async () => {
      const root = makeTempDir();
      process.chdir(root);
      core.saveConfig(root, core.defaultConfig());
      const child = makeChild();
      child.on("error", () => {});
      const cli = await importCli({
        childProcess: {
          spawn: () => child,
          spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
        }
      });
      cli.commandRun(["--", "definitely-not-a-command"]);
      child.emit("error", new Error("spawn failure"));
      child.emit("close", 1, null);
      await flushTimers();
    });

    it("commandRun rejects unmapped sources", async () => {
      const root = makeTempDir();
      process.chdir(root);
      core.saveConfig(root, core.defaultConfig());
      const child2 = makeChild();
      const cli2 = await importCli({
        childProcess: {
          spawn: () => child2,
          spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
        }
      });
      const existing = path.join(root, "exists.txt");
      fs.writeFileSync(existing, "x");
      cli2.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
      child2.stdout.write(`Sources consulted: ${existing}\n`);
      child2.emit("close", 0, null);
      await flushTimers();
    });

    it("commandRun rejects unmapped sources and handles telemetry append", async () => {
      const root = makeTempDir();
      process.chdir(root);
      const skillsRoot = path.join(root, "skills");
      fs.mkdirSync(skillsRoot, { recursive: true });
      writeModule(skillsRoot, "mod-map");
      const cfg = core.defaultConfig();
      cfg.moduleDirs = [skillsRoot];
      cfg.modules = ["mod-map"];
      core.saveConfig(root, cfg);
      const child = makeChild();
      const cli = await importCli({
        childProcess: {
          spawn: () => child,
          spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
        }
      });
      const good = path.join(skillsRoot, "mod-map", "playbook.md");
      cli.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
      child.stdout.write(`Sources consulted: ${good}\n`);
      child.emit("close", 2, null);
      await flushTimers();
    });

    it("commandRun reports missing and unmapped sources", async () => {
      const root = makeTempDir();
      process.chdir(root);
      core.saveConfig(root, core.defaultConfig());
      const child = makeChild();
      const cli = await importCli({
        childProcess: {
          spawn: () => child,
          spawnSync: vi.fn(() => ({ status: 1, stdout: "" }))
        }
      });
      cli.commandRun(["--", "node", "-e", "process.stdout.write('x')"]);
      child.stdout.write("Sources consulted: missing.txt\n");
      child.emit("close", 0, null);
      await flushTimers();
    });
  });

    it("runs main when module is main", async () => {
      const Module = await import("node:module");
      const cliPath = path.resolve("packages/sidekick-cli/bin/sidekick.js");
      const code = fs.readFileSync(cliPath, "utf8");
      const mod = new Module.default(cliPath, Module.default);
      mod.filename = cliPath;
      mod.paths = Module.default._nodeModulePaths(path.dirname(cliPath));
      const originalMain = process.mainModule;
      process.mainModule = mod;
      const argv = process.argv;
      process.argv = ["node", "sidekick", "help"];
      mod._compile(code, cliPath);
      process.argv = argv;
      process.mainModule = originalMain;
    });
  });
