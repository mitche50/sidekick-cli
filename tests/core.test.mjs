import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTempDir, writeModule } from "./helpers.mjs";

let core;
let internal;

beforeEach(async () => {
  vi.resetModules();
  core = await import("../packages/sidekick-core/index.js");
  internal = core._internal;
});

describe("sidekick-core internals", () => {
  it("ensures directories and handles invalid paths", () => {
    const root = makeTempDir();
    const dir = path.join(root, "a", "b");
    internal.ensureDir(dir);
    expect(fs.existsSync(dir)).toBe(true);
    const filePath = path.join(root, "file.txt");
    fs.writeFileSync(filePath, "x");
    expect(() => internal.ensureDir(filePath)).toThrow();
  });

  it("reads and writes json safely", () => {
    const root = makeTempDir();
    const filePath = path.join(root, "config.json");
    internal.writeJson(filePath, { ok: true });
    expect(internal.readJson(filePath).ok).toBe(true);
    fs.writeFileSync(filePath, "{bad");
    expect(() => internal.readJson(filePath)).toThrow();
  });

  it("writeJson produces trailing newline", () => {
    const root = makeTempDir();
    const filePath = path.join(root, "data.json");
    internal.writeJson(filePath, { ok: true });
    const raw = fs.readFileSync(filePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });
  it("normalizes newlines and paths", () => {
    expect(internal.normalizeNewlines("a\r\nb")).toBe("a\nb");
    expect(internal.normalizePath("a\\b")).toBe("a/b");
  });

  it("expands home paths", () => {
    const home = os.homedir();
    expect(internal.expandHome("~")).toBe(home);
    expect(internal.expandHome("~/x")).toBe(path.join(home, "x"));
    expect(internal.expandHome("a")).toBe("a");
  });

  it("validates module and adapter names", () => {
    expect(internal.isSafeModuleName("valid-name")).toBe(true);
    expect(internal.isSafeModuleName("Bad")).toBe(false);
    expect(internal.isSafeAdapterFilename("AGENT.md")).toBe(true);
    expect(internal.isSafeAdapterFilename("../evil")).toBe(false);
    expect(internal.isSafeAdapterFilename("/abs")).toBe(false);
    expect(internal.isSafeAdapterFilename("..")).toBe(false);
    expect(internal.isSafeAdapterFilename("A/B")).toBe(false);
    expect(internal.isSafeAdapterFilename("A\\B")).toBe(false);
    expect(internal.isSafeAdapterFilename("AGENTS.md")).toBe(false);
  });

  it("extracts sources from output", () => {
    const out = "Hello\nSources consulted: a, b\nSources consulted: c\n";
    expect(core.extractSources(out)).toEqual(["c"]);
    expect(core.extractSources("no sources")).toEqual([]);
  });

  it("extracts sources from single line", () => {
    expect(core.extractSources("Sources consulted: one, two")).toEqual(["one", "two"]);
  });

  it("detects managed gemini settings", () => {
    const newFmt = JSON.stringify({ context: { fileName: "AGENTS.md" } }, null, 2);
    const legacy = JSON.stringify({ contextFileName: "AGENTS.md" }, null, 2);
    expect(internal.isManagedGeminiSettingsContent(newFmt)).toBe(true);
    expect(internal.isManagedGeminiSettingsContent(legacy)).toBe(true);
    expect(internal.isManagedGeminiSettingsContent("{}")).toBe(false);
    expect(internal.isManagedGeminiSettingsContent("{")).toBe(false);
  });

  it("validates config shape and telemetry mode", () => {
    const cfg = core.defaultConfig();
    expect(internal.validateConfig(cfg)).toEqual(cfg);
    expect(() => internal.validateConfig(null)).toThrow(/expected an object/);
    expect(() => internal.validateConfig({ modules: "bad" })).toThrow(/config.modules/);
    expect(() => internal.validateConfig({ adapters: { symlinkFiles: "x" } })).toThrow(/symlinkFiles/);
    expect(() => internal.validateConfig({ adapters: { symlinkFiles: ["../bad"] } })).toThrow(/Invalid adapter filename/);
    expect(() => internal.validateConfig({ adapters: { agentsMd: "yes" } })).toThrow(/adapters.agentsMd/);
    expect(() => internal.validateConfig({ budgets: { indexMaxBytes: "x" } })).toThrow(/budgets.indexMaxBytes/);
    expect(() => internal.validateConfig({ budgets: { agentsMdKernelMaxBytes: -1 } })).toThrow(/budgets.agentsMdKernelMaxBytes/);
    expect(() => internal.validateConfig({ telemetry: "bad" })).toThrow(/telemetry/);
    expect(() => internal.validateConfig({ telemetry: { enabled: true, mode: "remote" } })).toThrow(/Unsupported telemetry/);
    expect(() => internal.validateConfig({ moduleDirs: "bad" })).toThrow(/moduleDirs/);
    expect(() => internal.validateConfig({ adapters: "bad" })).toThrow(/adapters/);
    expect(() => internal.validateConfig({ budgets: "bad" })).toThrow(/budgets/);
    expect(() => internal.validateConfig({ telemetry: { enabled: "nope" } })).toThrow(/telemetry.enabled/);
  });

  it("resolves module search dirs", () => {
    const root = makeTempDir();
    const dirs = internal.resolveModuleSearchDirs(root, { moduleDirs: ["./skills"] });
    expect(dirs[0]).toBe(path.join(root, "skills"));
    const fallback = internal.resolveModuleSearchDirs(root, { moduleDirs: [] });
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("formats index paths for relative and absolute files", () => {
    const root = makeTempDir();
    const file = path.join(root, "a.txt");
    fs.writeFileSync(file, "x");
    expect(internal.formatIndexPath(root, file)).toBe("a.txt");
    expect(internal.formatIndexPath(root, "/tmp/x.txt")).toContain("/tmp");
  });

  it("loads kernel template from project, package, or default", () => {
    const root = makeTempDir();
    const projectTemplateDir = path.join(root, "templates", "agents-md");
    fs.mkdirSync(projectTemplateDir, { recursive: true });
    fs.writeFileSync(path.join(projectTemplateDir, "kernel.md"), "# Project\n");
    expect(internal.loadKernelTemplate(root)).toBe("# Project\n");

    fs.rmSync(projectTemplateDir, { recursive: true, force: true });
    const pkgTemplate = internal.loadKernelTemplate(root);
    expect(pkgTemplate).toContain("AGENTS.md");

    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(internal.loadKernelTemplate(root)).toBe(internal.defaultKernelTemplate());
    expect(internal.defaultKernelTemplate()).toContain("AGENTS.md");
    existsSpy.mockRestore();
  });

  it("defaultConfig includes budgets and telemetry defaults", () => {
    const cfg = core.defaultConfig();
    expect(cfg.budgets.agentsMdKernelMaxBytes).toBe(10000);
    expect(cfg.budgets.indexMaxBytes).toBe(12000);
    expect(cfg.telemetry.mode).toBe("local");
  });

  it("builds index entries and parts", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-one");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-one");
    const index = core.buildIndexEntries([mod], root);
    expect(index).toContain("mod-one");
    const parts = internal.buildAgentsParts(root, [mod]);
    expect(parts.agentsContent).toContain("## Index");
  });

  it("resolves entry paths safely", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    const moduleDir = writeModule(skillsRoot, "mod-two");
    expect(internal.resolveEntryPath(moduleDir, "playbook.md", "playbook")).toContain("playbook.md");
    expect(() => internal.resolveEntryPath(moduleDir, "../evil", "playbook")).toThrow(/Invalid/);
    expect(() => internal.resolveEntryPath(moduleDir, "missing.md", "playbook")).toThrow(/Missing/);
    const dirPath = path.join(moduleDir, "dir");
    fs.mkdirSync(dirPath);
    expect(() => internal.resolveEntryPath(moduleDir, "dir", "playbook")).toThrow(/not a file/);
  });

  it("maps sources to modules and handles missing paths", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-three");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-three");
    const playbook = mod.playbookPath;
    const mapped = core.mapSourcesToModules(root, [mod], [playbook]);
    expect(mapped.size).toBe(1);
    const missing = core.mapSourcesToModules(root, [mod], [path.join(root, "nope")]);
    expect(missing.size).toBe(0);
    const mapped2 = core.mapSourcesToModules(root, [mod], [mod.skillPath]);
    expect(mapped2.size).toBe(1);
  });

  it("maps sources on win32 and handles symlinks", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-win");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-win");
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    const mapped = core.mapSourcesToModules(root, [mod], [mod.playbookPath]);
    expect(mapped.size).toBe(1);
    Object.defineProperty(process, "platform", originalPlatform);
  });

  it("gitHeadForPath returns commit or null", () => {
    const root = makeTempDir();
    const { spawnSync } = require("child_process");
    spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "a.txt"), "x");
    spawnSync("git", ["add", "a.txt"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["-c", "user.name=Sidekick", "-c", "user.email=sidekick@example.com", "commit", "-m", "init"], { cwd: root, stdio: "ignore" });
    const head = internal.gitHeadForPath(root);
    expect(head === null || typeof head === "string").toBe(true);
    expect(internal.gitHeadForPath(makeTempDir())).toBeNull();
  });

  it("handles managed symlinks", () => {
    const root = makeTempDir();
    const agents = path.join(root, "AGENTS.md");
    fs.writeFileSync(agents, "x");
    const link = path.join(root, "AGENT.md");
    fs.symlinkSync("AGENTS.md", link);
    expect(internal.isManagedSymlink(link, agents)).toBe(true);
    expect(internal.isManagedSymlink(path.join(root, "missing"), agents)).toBe(false);
    const badLink = path.join(root, "OTHER.md");
    fs.writeFileSync(badLink, "x");
    fs.symlinkSync("OTHER.md", path.join(root, "BAD.md"));
    expect(internal.isManagedSymlink(path.join(root, "BAD.md"), agents)).toBe(false);
  });

  it("writes outputs and lockfile with adapters", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-four");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-four");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.adapters.aiderConf = true;
    cfg.adapters.geminiSettings = true;
    cfg.adapters.copilotInstructions = true;
    cfg.adapters.claudeMd = true;
    cfg.adapters.claudeMdSymlink = true;
    core.writeAgentsOutputs(root, cfg, [mod]);
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".sidekick", "sidekick.lock.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".aider.conf.yml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".gemini", "settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".github", "copilot-instructions.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
  });

  it("resolveModule errors on manifest mismatch and missing files", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-ten", { manifest: { name: "other" } });
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-ten")).toThrow(/manifest.name/);
    const dir = path.join(skillsRoot, "mod-eleven");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sidekick.module.json"), JSON.stringify({ name: "mod-eleven" }, null, 2));
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-eleven")).toThrow(/Missing/);
  });

  it("resolveModule errors on missing playbook or kernel", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    const moduleDir = writeModule(skillsRoot, "mod-missing-files");
    fs.rmSync(path.join(moduleDir, "playbook.md"));
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-missing-files")).toThrow(/Missing playbook/);
    fs.writeFileSync(path.join(moduleDir, "playbook.md"), "# Playbook\n");
    fs.rmSync(path.join(moduleDir, "snippets", "kernel.md"));
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-missing-files")).toThrow(/Missing kernel/);
  });

  it("writeAgentsOutputs handles empty modules and no agents", () => {
    const root = makeTempDir();
    const cfg = core.defaultConfig();
    cfg.adapters.agentsMd = false;
    cfg.adapters.symlinkFiles = [];
    cfg.adapters.aiderConf = false;
    cfg.adapters.geminiSettings = false;
    core.writeAgentsOutputs(root, cfg, []);
    expect(fs.existsSync(path.join(root, ".sidekick", "index.min.txt"))).toBe(true);
  });

  it("writeAgentsOutputs preflight rejects unmanaged adapter files", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-copy");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-copy");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-copy"];
    cfg.adapters.symlinkFiles = ["AGENT.md"];
    fs.writeFileSync(path.join(root, "AGENT.md"), "unmanaged");
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/wasn't created/);
  });

  it("promotes kernel rules with budget enforcement", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-five");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-five");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-five"];
    const res = core.promoteModuleKernel(root, cfg, mod, { top: 1, dryRun: true });
    expect(res.added.length).toBeGreaterThan(0);
    cfg.budgets.agentsMdKernelMaxBytes = 1;
    expect(() => core.promoteModuleKernel(root, cfg, mod, { top: 1, dryRun: true })).toThrow(/Kernel budget exceeded/);
  });

  it("telemetry read/write", () => {
    const root = makeTempDir();
    core.appendTelemetry(root, { module: "x", ts: "now" });
    const entries = core.loadTelemetry(root);
    expect(entries.length).toBe(1);
  });

  it("loadTelemetry handles bad lines and empty files", () => {
    const root = makeTempDir();
    const usagePath = path.join(root, ".sidekick", "telemetry", "usage.jsonl");
    fs.mkdirSync(path.dirname(usagePath), { recursive: true });
    fs.writeFileSync(usagePath, "not json\n");
    expect(core.loadTelemetry(root)).toEqual([]);
    fs.writeFileSync(usagePath, "\n");
    expect(core.loadTelemetry(root)).toEqual([]);
  });

  it("promote handles empty snippets and header edge cases", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-six", { kernel: " \n" });
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-six");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-six"];
    expect(() => core.promoteModuleKernel(root, cfg, mod, { top: 1, dryRun: true })).toThrow(/No kernel snippet/);

    const templateDir = path.join(root, "templates", "agents-md");
    fs.mkdirSync(templateDir, { recursive: true });
    const templatePath = path.join(templateDir, "kernel.md");
    fs.writeFileSync(templatePath, "Header mention ### mod-seven not on its own line\n");
    writeModule(skillsRoot, "mod-seven");
    const modSeven = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-seven");
    cfg.modules = ["mod-seven"];
    const res = core.promoteModuleKernel(root, cfg, modSeven, { top: 1, dryRun: true });
    expect(res.changed).toBe(false);
  });

  it("promote returns unchanged when header exists and nothing to add", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-none", { kernel: "- Same\n" });
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-none");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-none"];
    const templateDir = path.join(root, "templates", "agents-md");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, "kernel.md"), "## Promoted Rules\n### mod-none\n- Same\n");
    const res = core.promoteModuleKernel(root, cfg, mod, { top: 1, dryRun: true });
    expect(res.changed).toBe(false);
  });

  it("builds agents content and validates budgets", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-eight");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-eight");
    const parts = internal.buildAgentsParts(root, [mod]);
    const content = core.buildAgentsMdContent(root, [mod]);
    expect(content).toContain("AGENTS.md");
    expect(parts.indexContent).toContain("mod-eight");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-eight"];
    cfg.budgets.agentsMdKernelMaxBytes = 1;
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/Kernel budget exceeded/);
    cfg.budgets.agentsMdKernelMaxBytes = 10000;
    cfg.budgets.indexMaxBytes = 1;
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/Index budget exceeded/);
  });

  it("writeLockFile and formatIndexPath handle external paths", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-nine");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-nine");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-nine"];
    cfg.adapters.agentsMd = false;
    cfg.adapters.symlinkFiles = [];
    cfg.adapters.aiderConf = false;
    cfg.adapters.geminiSettings = false;
    core.writeAgentsOutputs(root, cfg, [mod]);
    const lockPath = path.join(root, ".sidekick", "sidekick.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);
    const outside = internal.formatIndexPath(root, path.join(os.tmpdir(), "outside.txt"));
    expect(outside).toContain("/outside.txt");
  });

  it("handles loadConfig error and optional reads", () => {
    const root = makeTempDir();
    expect(() => core.loadConfig(root)).toThrow(/No config found/);
    const optional = internal.readOptional(path.join(root, "missing.txt"));
    expect(optional).toBe("");
  });

  it("strips agents header and handles no header", () => {
    expect(internal.stripAgentsHeader("# AGENTS.md\n\nHello\n")).toBe("Hello\n");
    expect(internal.stripAgentsHeader("No header\n")).toBe("No header\n");
  });

  it("ensureConfig writes default config when missing", () => {
    const root = makeTempDir();
    const cfg = core.ensureConfig(root);
    expect(cfg.modules).toEqual([]);
    expect(fs.existsSync(path.join(root, ".sidekick", "config.json"))).toBe(true);
  });

  it("validateConfig rejects invalid fields", () => {
    expect(() => internal.validateConfig({ adapters: { agentsMd: "yes" } })).toThrow(/adapters.agentsMd/);
    expect(() => internal.validateConfig({ budgets: { agentsMdKernelMaxBytes: -1 } })).toThrow(/budgets.agentsMdKernelMaxBytes/);
    expect(() => internal.validateConfig({ telemetry: { enabled: "nope" } })).toThrow(/telemetry.enabled/);
  });

  it("validateConfig rejects invalid module names", () => {
    expect(() => internal.validateConfig({ modules: ["Bad"] })).toThrow(/Invalid module name/);
  });

  it("resolveModule rejects invalid names and missing modules", () => {
    const root = makeTempDir();
    expect(() => core.resolveModule(root, { moduleDirs: [root] }, "Bad")).toThrow(/Invalid module name/);
    expect(() => core.resolveModule(root, { moduleDirs: [root] }, "missing")).toThrow(/Module not found/);
  });

  it("resolveModule rejects invalid manifest and missing entrypoints", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-bad", { manifest: { name: "Bad" } });
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-bad")).toThrow(/Invalid manifest.name/);

    const dir = path.join(skillsRoot, "mod-missing");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sidekick.module.json"), JSON.stringify({ name: "mod-missing" }, null, 2));
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-missing")).toThrow(/Missing/);
  });

  it("resolveModule hits post-entrypoint existence checks", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    const moduleDir = writeModule(skillsRoot, "mod-checks");
    const skillPath = path.join(moduleDir, "SKILL.md");
    const playbookPath = path.join(moduleDir, "playbook.md");
    const kernelPath = path.join(moduleDir, "snippets", "kernel.md");
    let skillCalls = 0;
    let playbookCalls = 0;
    let kernelCalls = 0;
    const realExists = fs.existsSync;
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (p === skillPath) {
        skillCalls += 1;
        return skillCalls === 1;
      }
      if (p === playbookPath) {
        playbookCalls += 1;
        return playbookCalls === 1;
      }
      if (p === kernelPath) {
        kernelCalls += 1;
        return kernelCalls === 1;
      }
      return realExists(p);
    });
    expect(() => core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-checks")).toThrow(/Missing/);
    existsSpy.mockRestore();
  });

  it("validateBudgets throws on kernel and index overages", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-over", { kernel: "- One\n- Two\n" });
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-over");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-over"];
    cfg.budgets.agentsMdKernelMaxBytes = 1;
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/Kernel budget exceeded/);
    cfg.budgets.agentsMdKernelMaxBytes = 10000;
    cfg.budgets.indexMaxBytes = 1;
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/Index budget exceeded/);
  });

  it("resolveEntryPath rejects symlink escape", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    const moduleDir = writeModule(skillsRoot, "mod-escape");
    const outside = path.join(root, "outside.txt");
    fs.writeFileSync(outside, "x");
    fs.symlinkSync(outside, path.join(moduleDir, "escape.md"));
    expect(() => internal.resolveEntryPath(moduleDir, "escape.md", "playbook")).toThrow(/outside module/);
  });

  it("maps sources using playbook/kernel/skill paths even when module dir differs", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-map");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-map");
    const otherDir = path.join(root, "elsewhere");
    fs.mkdirSync(otherDir, { recursive: true });
    const customModule = {
      name: mod.name,
      dir: otherDir,
      playbookPath: mod.playbookPath,
      kernelPath: mod.kernelPath,
      skillPath: mod.skillPath
    };
    const realSpy = vi.spyOn(fs, "realpathSync").mockImplementation((p) => {
      if (p === mod.playbookPath) throw new Error("boom");
      return p;
    });
    const relPlaybook = path.relative(root, mod.playbookPath);
    const mapped = core.mapSourcesToModules(root, [customModule], [relPlaybook]);
    realSpy.mockRestore();
    expect(mapped.size).toBe(1);
  });

  it("mapSourcesToModules tolerates realpath errors", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-real");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-real");
    const realSpy = vi.spyOn(fs, "realpathSync").mockImplementation((p) => {
      if (p === mod.dir) throw new Error("boom");
      return p;
    });
    const mapped = core.mapSourcesToModules(root, [mod], [mod.playbookPath]);
    expect(mapped.size).toBe(1);
    realSpy.mockRestore();
  });

  it("promote inserts under existing header and writes file", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-promote", { kernel: "- First\n- Second\n" });
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-promote");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-promote"];
    const templateDir = path.join(root, "templates", "agents-md");
    fs.mkdirSync(templateDir, { recursive: true });
    const templatePath = path.join(templateDir, "kernel.md");
    fs.writeFileSync(templatePath, "## Promoted Rules\n### mod-promote\n- Existing\n");
    const res = core.promoteModuleKernel(root, cfg, mod, { top: 2 });
    expect(res.changed).toBe(true);
    expect(fs.readFileSync(templatePath, "utf8")).toContain("- First");
  });

  it("promote skips when nothing to add and header missing", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-skip", { kernel: "- Rule\n" });
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-skip");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-skip"];
    const templateDir = path.join(root, "templates", "agents-md");
    fs.mkdirSync(templateDir, { recursive: true });
    const templatePath = path.join(templateDir, "kernel.md");
    fs.writeFileSync(templatePath, "# AGENTS.md\n\n- Rule\n");
    const res = core.promoteModuleKernel(root, cfg, mod, { top: 1, dryRun: true });
    expect(res.changed).toBe(false);
  });

  it("validateBudgets rejects invalid values", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-budget");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-budget");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-budget"];
    cfg.budgets.agentsMdKernelMaxBytes = "bad";
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/Invalid agentsMdKernelMaxBytes/);
    cfg.budgets.agentsMdKernelMaxBytes = 10000;
    cfg.budgets.indexMaxBytes = "bad";
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/Invalid indexMaxBytes/);
  });

  it("writeAgentsOutputs rejects unmanaged AGENTS.md and handles managed copies", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-managed");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-managed");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.adapters.symlinkFiles = ["AGENT.md"];

    fs.writeFileSync(path.join(root, "AGENTS.md"), "not managed");
    expect(() => core.writeAgentsOutputs(root, cfg, [mod])).toThrow(/wasn't created by Sidekick/);

    const managedAgents = "<!-- sidekick:generated -->\nOld\n";
    fs.writeFileSync(path.join(root, "AGENTS.md"), managedAgents);
    fs.writeFileSync(path.join(root, "AGENT.md"), managedAgents);
    core.writeAgentsOutputs(root, cfg, [mod]);
    expect(fs.existsSync(path.join(root, "AGENT.md"))).toBe(true);
  });

  it("writeAgentsOutputs treats previous AGENTS.md as managed copy", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-prev");
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-prev");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.adapters.symlinkFiles = ["AGENT.md"];
    const prevAgents = "<!-- sidekick:generated -->\nPrev\n";
    fs.writeFileSync(path.join(root, "AGENTS.md"), prevAgents);
    fs.writeFileSync(path.join(root, "AGENT.md"), prevAgents);
    core.writeAgentsOutputs(root, cfg, [mod]);
    expect(fs.existsSync(path.join(root, "AGENT.md"))).toBe(true);
  });

  it("loadTelemetry returns empty for empty file", () => {
    const root = makeTempDir();
    const usagePath = path.join(root, ".sidekick", "telemetry", "usage.jsonl");
    fs.mkdirSync(path.dirname(usagePath), { recursive: true });
    fs.writeFileSync(usagePath, "");
    expect(core.loadTelemetry(root)).toEqual([]);
  });

  it("defaultKernelTemplate returns fallback content", () => {
    expect(internal.defaultKernelTemplate()).toContain("AGENTS.md");
  });

  it("promote writes kernel template when not dry-run", () => {
    const root = makeTempDir();
    const skillsRoot = path.join(root, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-write", { kernel: "- One\n" });
    const mod = core.resolveModule(root, { moduleDirs: [skillsRoot] }, "mod-write");
    const cfg = core.defaultConfig();
    cfg.moduleDirs = [skillsRoot];
    cfg.modules = ["mod-write"];
    const res = core.promoteModuleKernel(root, cfg, mod, { top: 1 });
    expect(res.changed).toBe(true);
    const templatePath = path.join(root, "templates", "agents-md", "kernel.md");
    expect(fs.existsSync(templatePath)).toBe(true);
  });
});
