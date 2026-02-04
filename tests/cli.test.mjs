import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { makeTempDir, writeModule } from "./helpers.mjs";

describe("sidekick CLI", () => {
  let cli;
  let core;
  let tempRoot;
  let skillsRoot;
  let rootSpy;
  let prevCwd;

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    core = await import("../packages/sidekick-core/index.js");
    cli = await import("../packages/sidekick-cli/bin/sidekick.js");
    tempRoot = makeTempDir();
    prevCwd = process.cwd();
    process.chdir(tempRoot);
    skillsRoot = path.join(tempRoot, "skills");
    fs.mkdirSync(skillsRoot, { recursive: true });
    writeModule(skillsRoot, "mod-a", { description: "Module A" });
    writeModule(skillsRoot, "mod-b", { description: "Module B" });
    core.ensureConfig(tempRoot);
    const cfgPath = path.join(tempRoot, ".sidekick", "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.moduleDirs = [skillsRoot];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    rootSpy = vi.spyOn(cli, "repoRoot").mockReturnValue(tempRoot);
  });

  afterEach(() => {
    if (prevCwd) process.chdir(prevCwd);
    vi.restoreAllMocks();
  });

  it("lists modules with descriptions", () => {
    const output = [];
    vi.spyOn(console, "log").mockImplementation((msg) => output.push(msg));
    cli.commandList();
    expect(output.join("\n")).toContain("mod-a");
    expect(output.join("\n")).toContain("Module A");
  });

  it("adds and removes modules", () => {
    cli.commandAdd(["mod-a"]);
    let cfg = JSON.parse(fs.readFileSync(path.join(tempRoot, ".sidekick", "config.json"), "utf8"));
    expect(cfg.modules).toContain("mod-a");
    cli.commandRemove("mod-a");
    cfg = JSON.parse(fs.readFileSync(path.join(tempRoot, ".sidekick", "config.json"), "utf8"));
    expect(cfg.modules).not.toContain("mod-a");
  });

  it("builds AGENTS and adapters", () => {
    cli.commandAdd(["mod-a"]);
    cli.commandBuild();
    expect(fs.existsSync(path.join(tempRoot, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, ".sidekick", "index.min.txt"))).toBe(true);
  });

  it("parses frontmatter", () => {
    const fm = cli.parseFrontmatter("---\nname: x\ndescription: y\n---\nBody");
    expect(fm.name).toBe("x");
    expect(fm.description).toBe("y");
  });

  it("matches patterns and triggers", () => {
    expect(cli.matchesPattern("src/app.js", "**/*.js")).toBe(true);
    expect(cli.triggerMatches({ paths: ["docs/**"] }, ["docs/readme.md"])).toBe(true);
  });

  it("init prompts when no global skills and non-tty", () => {
    rootSpy.mockReturnValue(tempRoot);
    const realExists = fs.existsSync;
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (p === path.join(os.homedir(), ".agents", "skills")) return false;
      return realExists(p);
    });
    const tty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));
    cli.commandInit();
    expect(logs.join("\n")).toContain("Global skills not found");
    Object.defineProperty(process.stdin, "isTTY", { value: tty, configurable: true });
    rootSpy.mockRestore();
    existsSpy.mockRestore();
  });

  it("update with local repo", () => {
    const repo = makeTempDir();
    const skills = path.join(repo, "skills");
    fs.mkdirSync(skills, { recursive: true });
    writeModule(skills, "install-mod");
    const target = path.join(tempRoot, ".agents-skills");
    cli.commandUpdate(["--repo", repo, "--dir", target]);
    expect(fs.existsSync(path.join(target, "install-mod", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, ".sidekick-install.json"))).toBe(true);
  });

  it("commandRun handles missing sources", async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    vi.resetModules();
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const childProcess = require("child_process");
    const originalSpawn = childProcess.spawn;
    const originalSpawnSync = childProcess.spawnSync;
    childProcess.spawn = () => child;
    childProcess.spawnSync = () => ({ status: 1, stdout: "" });
    const cliMock = await import("../packages/sidekick-cli/bin/sidekick.js");
    vi.spyOn(cliMock, "repoRoot").mockReturnValue(tempRoot);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    cliMock.commandRun(["--", "node", "-e", "console.log('hi')"]);
    child.emit("close", 0, null);
    await new Promise((r) => setImmediate(r));
    expect(exitSpy).toHaveBeenCalled();
    childProcess.spawn = originalSpawn;
    childProcess.spawnSync = originalSpawnSync;
  });
});
