import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTempDir, writeModule } from "./helpers.mjs";

describe("repo-install", () => {
  let repoInstall;
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // no-op
  });

  it("resolves local paths before github shorthand", async () => {
    const temp = makeTempDir();
    const local = path.join(temp, "owner", "repo");
    fs.mkdirSync(local, { recursive: true });
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const spec = repoInstall.resolveRepoSpec(local);
    expect(spec.type).toBe("local");
  });

  it("throws on missing repo arg and expands home", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    expect(() => repoInstall.resolveRepoSpec()).toThrow(/Repo path required/);
    const homeSpec = repoInstall.resolveRepoSpec("~");
    expect(homeSpec.type).toBe("local");
    const homeSpec2 = repoInstall.resolveRepoSpec("~/tmp");
    expect(homeSpec2.path).toContain("tmp");
    const homeSpec3 = repoInstall.resolveRepoSpec("~\\tmp");
    expect(homeSpec3.path).toContain("tmp");
  });

  it("resolves github shorthand", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const cwd = process.cwd();
    const temp = makeTempDir();
    process.chdir(temp);
    const spec = repoInstall.resolveRepoSpec("ghost-owner/ghost-repo");
    process.chdir(cwd);
    expect(spec.type).toBe("github");
    expect(spec.owner).toBe("ghost-owner");
    expect(spec.repo).toBe("ghost-repo");
    expect(spec.url).toContain("github.com");
  });

  it("returns local spec for non-github missing paths", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const cwd = process.cwd();
    const temp = makeTempDir();
    process.chdir(temp);
    const spec = repoInstall.resolveRepoSpec("not-a-repo");
    process.chdir(cwd);
    expect(spec.type).toBe("local");
  });

  it("installs local repo to cache", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const source = makeTempDir();
    writeModule(source, "skill-one");
    const nested = path.join(source, "nested");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, "file.txt"), "x");
    const dest = makeTempDir("sidekick-cache-");
    fs.rmSync(dest, { recursive: true, force: true });
    repoInstall.installRepoToCache({ type: "local", path: source }, dest);
    expect(fs.existsSync(path.join(dest, "skill-one", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "nested", "file.txt"))).toBe(true);
  });

  it("rejects existing cache destination", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const dest = makeTempDir("sidekick-cache-");
    expect(() => repoInstall.installRepoToCache({ type: "local", path: dest }, dest))
      .toThrow(/already installed/);
  });

  it("throws when git missing for github clone", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    repoInstall._internal.setSpawnSyncForTests(() => ({ status: null, error: { code: "ENOENT" } }));
    const dest = makeTempDir("sidekick-cache-");
    fs.rmSync(dest, { recursive: true, force: true });
    expect(() => repoInstall.installRepoToCache({ type: "github", url: "https://example.com/x.git" }, dest))
      .toThrow(/git/);
  });

  it("handles github clone stderr and success", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    repoInstall._internal.setSpawnSyncForTests(() => ({ status: 1, stderr: "boom" }));
    const dest = makeTempDir("sidekick-cache-");
    fs.rmSync(dest, { recursive: true, force: true });
    expect(() => repoInstall.installRepoToCache({ type: "github", url: "https://example.com/x.git" }, dest))
      .toThrow(/boom/);
    repoInstall._internal.setSpawnSyncForTests(() => ({ status: 0, stderr: "" }));
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const dest2 = makeTempDir("sidekick-cache-");
    fs.rmSync(dest2, { recursive: true, force: true });
    expect(() => repoInstall.installRepoToCache({ type: "github", url: "https://example.com/x.git" }, dest2))
      .not.toThrow();
  });

  it("handles github clone with error message and cleanup", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const dest = makeTempDir("sidekick-cache-");
    fs.rmSync(dest, { recursive: true, force: true });
    repoInstall._internal.setSpawnSyncForTests(() => {
      fs.mkdirSync(dest, { recursive: true });
      return { status: 1, stderr: "", error: { message: "boom" } };
    });
    expect(() => repoInstall.installRepoToCache({ type: "github", url: "https://example.com/x.git" }, dest))
      .toThrow(/boom/);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("rejects local paths that are missing or not directories", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const dest = makeTempDir("sidekick-cache-");
    fs.rmSync(dest, { recursive: true, force: true });
    expect(() => repoInstall.installRepoToCache({ type: "local", path: "/nope" }, dest))
      .toThrow(/not found/);
    const file = path.join(makeTempDir(), "file.txt");
    fs.writeFileSync(file, "x");
    expect(() => repoInstall.installRepoToCache({ type: "local", path: file }, dest))
      .toThrow(/not a directory/);
  });

  it("installs skills into target dir", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const source = makeTempDir();
    const skillsDir = path.join(source, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    writeModule(skillsDir, "skill-two");
    const target = makeTempDir("sidekick-skills-");
    fs.rmSync(target, { recursive: true, force: true });
    repoInstall.installSkillsToDir({ type: "local", path: source }, target, {});
    expect(fs.existsSync(path.join(target, "skill-two", "SKILL.md"))).toBe(true);
    const meta = repoInstall.readInstallMetadata(target);
    expect(meta).toBeTruthy();
  });

  it("installSkillsToDir handles force, missing skills, and github errors", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const repo = makeTempDir();
    const skillsDir = path.join(repo, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    writeModule(skillsDir, "skill-force");
    const target = makeTempDir("sidekick-skills-");
    fs.writeFileSync(path.join(target, "keep.txt"), "x");
    expect(() => repoInstall.installSkillsToDir({ type: "local", path: repo }, target)).toThrow(/Target already exists/);
    repoInstall.installSkillsToDir({ type: "local", path: repo }, target, { force: true });
    expect(fs.existsSync(path.join(target, ".sidekick-install.json"))).toBe(true);

    const badRepo = makeTempDir();
    expect(() => repoInstall.installSkillsToDir({ type: "local", path: badRepo }, target, { force: true }))
      .toThrow(/skills/);

    repoInstall._internal.setSpawnSyncForTests(() => ({ status: 1, stderr: "clone failed" }));
    expect(() => repoInstall.installSkillsToDir({ type: "github", url: "https://example.com/x.git", owner: "o", repo: "r" }, target))
      .toThrow(/clone failed/);
  });

  it("cleans up cache dir on copy failure", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const source = makeTempDir();
    fs.writeFileSync(path.join(source, "file.txt"), "x");
    const destRoot = makeTempDir("sidekick-cache-");
    const dest = path.join(destRoot, "dest");
    const copySpy = vi.spyOn(fs, "copyFileSync").mockImplementationOnce(() => {
      throw new Error("copy failed");
    });
    expect(() => repoInstall.installRepoToCache({ type: "local", path: source }, dest)).toThrow(/copy failed/);
    expect(fs.existsSync(dest)).toBe(false);
    copySpy.mockRestore();
  });

  it("installSkillsToDir handles ref and github success", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    repoInstall._internal.setSpawnSyncForTests((cmd, args) => {
      const dest = args[args.length - 1];
      const skillsDir = path.join(dest, "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      writeModule(skillsDir, "skill-branch");
      return { status: 0, stderr: "" };
    });
    const target = makeTempDir("sidekick-skills-");
    fs.rmSync(target, { recursive: true, force: true });
    repoInstall.installSkillsToDir({ type: "github", url: "https://example.com/x.git", owner: "o", repo: "r" }, target, { ref: "main" });
    expect(fs.existsSync(path.join(target, "skill-branch", "SKILL.md"))).toBe(true);
  });

  it("reads install metadata safely and discovers skills", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const dir = makeTempDir("sidekick-install-");
    expect(repoInstall.readInstallMetadata(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, ".sidekick-install.json"), "{bad");
    expect(repoInstall.readInstallMetadata(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, "SKILL.md"), "x");
    fs.mkdirSync(path.join(dir, "child"));
    fs.writeFileSync(path.join(dir, "child", "SKILL.md"), "x");
    const skills = repoInstall.discoverSkills(dir);
    expect(skills.length).toBe(2);
  });

  it("discoverSkills returns child skill names", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const dir = makeTempDir("sidekick-discover-");
    fs.mkdirSync(path.join(dir, "alpha"));
    fs.writeFileSync(path.join(dir, "alpha", "SKILL.md"), "x");
    fs.mkdirSync(path.join(dir, "beta"));
    fs.writeFileSync(path.join(dir, "beta", "SKILL.md"), "x");
    const skills = repoInstall.discoverSkills(dir);
    expect(skills).toContain("alpha");
    expect(skills).toContain("beta");
  });

  it("discoverSkillsInRepo prefers repo root and falls back to skills/ dir", async () => {
    repoInstall = await import("../packages/sidekick-cli/bin/repo-install.js");
    const repoRoot = makeTempDir();
    writeModule(repoRoot, "root-skill");
    const rootResult = repoInstall.discoverSkillsInRepo(repoRoot);
    expect(rootResult.root).toBe(repoRoot);
    expect(rootResult.skills).toContain("root-skill");

    const repoNested = makeTempDir();
    const nestedSkillsDir = path.join(repoNested, "skills");
    fs.mkdirSync(nestedSkillsDir, { recursive: true });
    writeModule(nestedSkillsDir, "nested-skill");
    const nestedResult = repoInstall.discoverSkillsInRepo(repoNested);
    expect(nestedResult.root).toBe(nestedSkillsDir);
    expect(nestedResult.skills).toContain("nested-skill");
  });
});
