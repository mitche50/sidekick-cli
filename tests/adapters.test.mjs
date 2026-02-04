import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTempDir } from "./helpers.mjs";

let core;
let adapterRegistry;
let getEnabledAdapters;
let templateAdapter;

function makeContext(root, adapters = {}) {
  const agentsMdPath = path.join(root, "AGENTS.md");
  const agentsContent = "# AGENTS.md\n\n- Always be kind.\n";
  fs.writeFileSync(agentsMdPath, agentsContent);
  const prevAgentsContent = "# AGENTS.md\n\n- Previous rule.\n";
  const kernelContent = agentsContent;
  const isManagedCopy = (filePath) => {
    try {
      const current = core._internal.normalizeNewlines(fs.readFileSync(filePath, "utf8"));
      if (current === core._internal.normalizeNewlines(agentsContent)) return true;
      if (current === core._internal.normalizeNewlines(prevAgentsContent)) return true;
      return false;
    } catch {
      return false;
    }
  };
  return {
    fs,
    path,
    root,
    adapters,
    agentsMdPath,
    agentsContent,
    prevAgentsContent,
    kernelContent,
    normalizeNewlines: core._internal.normalizeNewlines,
    isSafeAdapterFilename: core._internal.isSafeAdapterFilename,
    isManagedSymlink: core._internal.isManagedSymlink,
    isManagedCopy,
    isManagedGeminiSettingsContent: core._internal.isManagedGeminiSettingsContent,
    ensureDir: core._internal.ensureDir,
    stripAgentsHeader: core._internal.stripAgentsHeader
  };
}

beforeEach(async () => {
  vi.resetModules();
  core = await import("../packages/sidekick-core/index.js");
  const adaptersModule = await import("../packages/sidekick-core/adapters/index.js");
  adapterRegistry = adaptersModule.adapterRegistry;
  getEnabledAdapters = adaptersModule.getEnabledAdapters;
  const templateModule = await import("../packages/sidekick-core/adapters/template.js");
  templateAdapter = templateModule.default || templateModule;
});

describe("adapter registry", () => {
  it("filters enabled adapters", () => {
    const registry = [
      { id: "a", isEnabled: () => true },
      { id: "b", isEnabled: () => false }
    ];
    const enabled = getEnabledAdapters({ adapters: {} }, registry);
    expect(enabled.map((a) => a.id)).toEqual(["a"]);
  });

  it("ignores adapters without isEnabled", () => {
    const registry = [{ id: "a" }];
    const enabled = getEnabledAdapters({ adapters: {} }, registry);
    expect(enabled.length).toBe(0);
  });

  it("detects enabled adapters from registry", () => {
    const registry = adapterRegistry();
    const config = { adapters: { symlinkFiles: ["AGENT.md"], aiderConf: true } };
    const enabled = getEnabledAdapters(config, registry).map((adapter) => adapter.id);
    expect(enabled).toContain("symlinkFiles");
    expect(enabled).toContain("aiderConf");
  });

  it("adapter isEnabled functions execute", () => {
    const registry = adapterRegistry();
    const config = {
      adapters: {
        symlinkFiles: ["AGENT.md"],
        aiderConf: true,
        geminiSettings: true,
        copilotInstructions: true,
        claudeMd: true,
        cursorRules: true,
        windsurfRules: true,
        clineRules: true,
        jetbrainsRules: true,
        replitMd: true
      }
    };
    registry.forEach((adapter) => {
      if (typeof adapter.isEnabled === "function") {
        expect(typeof adapter.isEnabled(config)).toBe("boolean");
      }
    });
  });

  it("template adapter exports work", () => {
    expect(templateAdapter.isEnabled({ adapters: { adapterIdFlag: true } })).toBe(true);
    templateAdapter.preflight({});
    templateAdapter.write({});
  });
});

describe("adapters", () => {
  let root;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("symlinkFiles preflight rejects invalid name and unmanaged files", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const ctx = makeContext(root, { symlinkFiles: ["../evil"], force: false });
    expect(() => symlinkAdapter.preflight(ctx)).toThrow(/Invalid adapter filename/);

    const safeName = "AGENT.md";
    fs.writeFileSync(path.join(root, safeName), "not managed");
    const ctx2 = makeContext(root, { symlinkFiles: [safeName], force: false });
    expect(() => symlinkAdapter.preflight(ctx2)).toThrow(/Won't overwrite/);
  });

  it("symlinkFiles preflight accepts managed symlink and handles errors", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    fs.symlinkSync("AGENTS.md", path.join(root, "AGENT.md"));
    const ctx = makeContext(root, { symlinkFiles: ["AGENT.md"], force: false });
    expect(() => symlinkAdapter.preflight(ctx)).not.toThrow();

    const ctxError = makeContext(root, { symlinkFiles: ["BROKEN.md"], force: false });
    ctxError.isManagedSymlink = () => { throw new Error("boom"); };
    fs.writeFileSync(path.join(root, "BROKEN.md"), "x");
    expect(() => symlinkAdapter.preflight(ctxError)).toThrow(/Won't overwrite/);
  });

  it("symlinkFiles write supports symlink, copy fallback, and errors", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const ctx = makeContext(root, { symlinkFiles: ["AGENT.md"], force: true });
    symlinkAdapter.write(ctx);
    expect(fs.existsSync(path.join(root, "AGENT.md"))).toBe(true);

    const symlinkSpy = vi.spyOn(fs, "symlinkSync").mockImplementation(() => {
      throw new Error("no symlink");
    });
    const copySpy = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    symlinkAdapter.write(ctx);
    expect(copySpy).toHaveBeenCalled();
    symlinkSpy.mockRestore();

    const symlinkFail = vi.spyOn(fs, "symlinkSync").mockImplementation(() => {
      throw new Error("no symlink");
    });
    const copyFail = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {
      throw new Error("copy failed");
    });
    expect(() => symlinkAdapter.write(ctx)).toThrow(/Failed to create adapter/);
    symlinkFail.mockRestore();
    copyFail.mockRestore();
  });

  it("symlinkFiles write rejects invalid name and unsafe file", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const badCtx = makeContext(root, { symlinkFiles: ["../bad"], force: false });
    expect(() => symlinkAdapter.write(badCtx)).toThrow(/Invalid adapter filename/);

    const ctx = makeContext(root, { symlinkFiles: ["AGENT.md"], force: false });
    fs.writeFileSync(path.join(root, "AGENT.md"), "not managed");
    expect(() => symlinkAdapter.write(ctx)).toThrow(/Won't overwrite/);
  });

  it("symlinkFiles write handles unlink errors and prev content", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const ctx = makeContext(root, { symlinkFiles: ["GEMINI.md"], force: false });
    const target = path.join(root, "GEMINI.md");
    fs.writeFileSync(target, ctx.prevAgentsContent);
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
      const err = new Error("nope");
      err.code = "ENOENT";
      throw err;
    });
    symlinkAdapter.write(ctx);
    unlinkSpy.mockRestore();
  });

  it("symlinkFiles write treats agents content as managed copy", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const ctx = makeContext(root, { symlinkFiles: ["AGENT.md"], force: false });
    fs.writeFileSync(path.join(root, "AGENT.md"), ctx.agentsContent);
    symlinkAdapter.write(ctx);
    expect(fs.existsSync(path.join(root, "AGENT.md"))).toBe(true);
  });

  it("symlinkFiles write handles read errors and reports unmanaged", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const ctx = makeContext(root, { symlinkFiles: ["AGENT.md"], force: false });
    const target = path.join(root, "AGENT.md");
    fs.mkdirSync(target);
    expect(() => symlinkAdapter.write(ctx)).toThrow(/Won't overwrite/);
  });

  it("symlinkFiles write surfaces unlink errors", () => {
    const registry = adapterRegistry();
    const symlinkAdapter = registry.find((a) => a.id === "symlinkFiles");
    const ctx = makeContext(root, { symlinkFiles: ["AGENT.md"], force: false });
    const target = path.join(root, "AGENT.md");
    fs.mkdirSync(target);
    ctx.isManagedSymlink = () => true;
    expect(() => symlinkAdapter.write(ctx)).toThrow();
  });

  it("aiderConf adapter enforces managed content", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "aiderConf");
    const ctx = makeContext(root, { aiderConf: true, force: false });
    const aiderPath = path.join(root, ".aider.conf.yml");
    fs.writeFileSync(aiderPath, "bad");
    expect(() => adapter.preflight(ctx)).toThrow(/wasn't created/);
    ctx.adapters.force = true;
    adapter.write(ctx);
    expect(fs.readFileSync(aiderPath, "utf8")).toBe("read: AGENTS.md\n");
  });

  it("aiderConf adapter writes when empty", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "aiderConf");
    const ctx = makeContext(root, { aiderConf: true, force: false });
    adapter.write(ctx);
    expect(fs.readFileSync(path.join(root, ".aider.conf.yml"), "utf8")).toBe("read: AGENTS.md\n");
  });

  it("geminiSettings adapter validates directory and managed content", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "geminiSettings");
    const ctx = makeContext(root, { geminiSettings: true, force: false });
    const geminiPath = path.join(root, ".gemini");
    fs.writeFileSync(geminiPath, "not a dir");
    expect(() => adapter.preflight(ctx)).toThrow(/isn't a directory/);
    fs.rmSync(geminiPath);
    fs.mkdirSync(geminiPath);
    fs.writeFileSync(path.join(geminiPath, "settings.json"), "{\"bad\":true}");
    expect(() => adapter.preflight(ctx)).toThrow(/wasn't created/);
    ctx.adapters.force = true;
    adapter.write(ctx);
    expect(fs.existsSync(path.join(geminiPath, "settings.json"))).toBe(true);
  });

  it("copilot instructions adapter enforces managed content and writes", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "copilotInstructions");
    const ctx = makeContext(root, { copilotInstructions: true, force: false });
    const githubDir = path.join(root, ".github");
    fs.writeFileSync(githubDir, "not a dir");
    expect(() => adapter.preflight(ctx)).toThrow(/isn't a directory/);
    fs.rmSync(githubDir);
    fs.mkdirSync(githubDir);
    const filePath = path.join(githubDir, "copilot-instructions.md");
    fs.writeFileSync(filePath, "bad");
    expect(() => adapter.preflight(ctx)).toThrow(/wasn't created/);
    ctx.adapters.force = true;
    adapter.write(ctx);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("claude adapter handles managed content and symlink mode", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, claudeMdSymlink: false, force: false });
    const filePath = path.join(root, "CLAUDE.md");
    fs.writeFileSync(filePath, "bad");
    expect(() => adapter.preflight(ctx)).toThrow(/CLAUDE.md wasn't created/);
    fs.writeFileSync(filePath, "# Sidekick Instructions\n\n- Always be kind.\n");
    expect(() => adapter.preflight(ctx)).not.toThrow();
    adapter.write(ctx);
    expect(fs.readFileSync(filePath, "utf8")).toContain("Sidekick Instructions");

    const symlinkCtx = makeContext(root, { claudeMd: true, claudeMdSymlink: true, force: true });
    const symlinkSpy = vi.spyOn(fs, "symlinkSync").mockImplementation(() => {
      throw new Error("no symlink");
    });
    const copySpy = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    adapter.write(symlinkCtx);
    symlinkSpy.mockRestore();
    copySpy.mockRestore();
  });

  it("cursor, windsurf, cline, jetbrains, replit adapters preflight and write", () => {
    const registry = adapterRegistry();
    const adapters = [
      { id: "cursorRules", file: path.join(root, ".cursor", "rules", "sidekick.mdc") },
      { id: "windsurfRules", file: path.join(root, ".windsurf", "rules", "sidekick.md") },
      { id: "clineRules", file: path.join(root, ".clinerules", "sidekick.md") },
      { id: "jetbrainsRules", file: path.join(root, ".aiassistant", "rules", "sidekick.md") },
      { id: "replitMd", file: path.join(root, "replit.md") }
    ];
    adapters.forEach(({ id, file }) => {
      const adapter = registry.find((item) => item.id === id);
      const ctx = makeContext(root, { [id]: true, force: false });
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, "bad");
      expect(() => adapter.preflight(ctx)).toThrow(/wasn't created/);
      ctx.adapters.force = true;
      adapter.write(ctx);
      expect(fs.existsSync(file)).toBe(true);
    });
  });

  it("geminiSettings adapter errors on unmanaged content", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "geminiSettings");
    const ctx = makeContext(root, { geminiSettings: true, force: false });
    const dir = path.join(root, ".gemini");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "settings.json"), "{\"context\": {\"fileName\": \"OTHER\"}}");
    expect(() => adapter.write(ctx)).toThrow(/wasn't created/);
  });

  it("geminiSettings adapter rejects file-based .gemini dir", () => {
    const registry = adapterRegistry();
    const adapter = registry.find((a) => a.id === "geminiSettings");
    const ctx = makeContext(root, { geminiSettings: true, force: false });
    fs.writeFileSync(path.join(root, ".gemini"), "file");
    expect(() => adapter.write(ctx)).toThrow(/isn't a directory/);
  });

  it("copilot and cursor adapters write instructions and rules", () => {
    const registry = adapterRegistry();
    const copilot = registry.find((a) => a.id === "copilotInstructions");
    const cursor = registry.find((a) => a.id === "cursorRules");
    const ctx = makeContext(root, { copilotInstructions: true, cursorRules: true, force: false });
    copilot.write(ctx);
    cursor.write(ctx);
    expect(fs.existsSync(path.join(root, ".github", "copilot-instructions.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".cursor", "rules", "sidekick.mdc"))).toBe(true);
  });

  it("copilot adapter preflight enforces managed content", () => {
    const registry = adapterRegistry();
    const copilot = registry.find((a) => a.id === "copilotInstructions");
    const ctx = makeContext(root, { copilotInstructions: true, force: false });
    const dir = path.join(root, ".github");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "copilot-instructions.md"), "bad");
    expect(() => copilot.preflight(ctx)).toThrow(/wasn't created/);
  });

  it("cursor adapter preflight enforces directory type", () => {
    const registry = adapterRegistry();
    const cursor = registry.find((a) => a.id === "cursorRules");
    const ctx = makeContext(root, { cursorRules: true, force: false });
    const cursorDir = path.join(root, ".cursor");
    fs.writeFileSync(cursorDir, "not dir");
    expect(() => cursor.preflight(ctx)).toThrow(/isn't a directory/);
  });

  it("claude adapter supports content and symlink modes", () => {
    const registry = adapterRegistry();
    const claude = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, claudeMdSymlink: false, force: false });
    claude.write(ctx);
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8")).toContain("Sidekick Instructions");
    ctx.adapters.claudeMdSymlink = true;
    claude.write(ctx);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
  });

  it("claude adapter preflight accepts managed symlink", () => {
    const registry = adapterRegistry();
    const claude = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, force: false });
    fs.symlinkSync("AGENTS.md", path.join(root, "CLAUDE.md"));
    expect(() => claude.preflight(ctx)).not.toThrow();
  });

  it("claude adapter preflight accepts managed copy and instruction content", () => {
    const registry = adapterRegistry();
    const claude = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, force: false });
    fs.writeFileSync(path.join(root, "CLAUDE.md"), ctx.agentsContent);
    expect(() => claude.preflight(ctx)).not.toThrow();
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Sidekick Instructions\n\n- Always be kind.\n");
    expect(() => claude.preflight(ctx)).not.toThrow();
  });

  it("claude adapter preflight catches errors and rejects unmanaged", () => {
    const registry = adapterRegistry();
    const claude = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, force: false });
    ctx.isManagedSymlink = () => {
      throw new Error("boom");
    };
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "bad");
    expect(() => claude.preflight(ctx)).toThrow(/wasn't created/);
  });

  it("claude adapter symlink mode handles unlink and copy failures", () => {
    const registry = adapterRegistry();
    const claude = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, claudeMdSymlink: true, force: false });
    const filePath = path.join(root, "CLAUDE.md");
    fs.mkdirSync(filePath);
    expect(() => claude.write(ctx)).toThrow();

    fs.rmSync(filePath, { recursive: true, force: true });
    const symlinkFail = vi.spyOn(fs, "symlinkSync").mockImplementation(() => {
      throw new Error("no symlink");
    });
    const copyFail = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {
      throw new Error("copy failed");
    });
    expect(() => claude.write(ctx)).toThrow(/Failed to create adapter/);
    symlinkFail.mockRestore();
    copyFail.mockRestore();
  });

  it("claude adapter preflight rejects unmanaged file", () => {
    const registry = adapterRegistry();
    const claude = registry.find((a) => a.id === "claudeMd");
    const ctx = makeContext(root, { claudeMd: true, force: false });
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "bad");
    expect(() => claude.preflight(ctx)).toThrow(/wasn't created/);
  });

  it("windsurf, cline, jetbrains, and replit adapters write files", () => {
    const registry = adapterRegistry();
    const windsurf = registry.find((a) => a.id === "windsurfRules");
    const cline = registry.find((a) => a.id === "clineRules");
    const jetbrains = registry.find((a) => a.id === "jetbrainsRules");
    const replit = registry.find((a) => a.id === "replitMd");
    const ctx = makeContext(root, {
      windsurfRules: true,
      clineRules: true,
      jetbrainsRules: true,
      replitMd: true
    });
    windsurf.write(ctx);
    cline.write(ctx);
    jetbrains.write(ctx);
    replit.write(ctx);
    expect(fs.existsSync(path.join(root, ".windsurf", "rules", "sidekick.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".clinerules", "sidekick.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".aiassistant", "rules", "sidekick.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "replit.md"))).toBe(true);
  });

  it("cursor/windsurf/cline/jetbrains/replit preflight reject unmanaged content", () => {
    const registry = adapterRegistry();
    const cursor = registry.find((a) => a.id === "cursorRules");
    const windsurf = registry.find((a) => a.id === "windsurfRules");
    const cline = registry.find((a) => a.id === "clineRules");
    const jetbrains = registry.find((a) => a.id === "jetbrainsRules");
    const replit = registry.find((a) => a.id === "replitMd");
    const ctx = makeContext(root, {
      cursorRules: true,
      windsurfRules: true,
      clineRules: true,
      jetbrainsRules: true,
      replitMd: true,
      force: false
    });
    const cursorFile = path.join(root, ".cursor", "rules", "sidekick.mdc");
    fs.mkdirSync(path.dirname(cursorFile), { recursive: true });
    fs.writeFileSync(cursorFile, "bad");
    expect(() => cursor.preflight(ctx)).toThrow(/wasn't created/);

    const windsurfFile = path.join(root, ".windsurf", "rules", "sidekick.md");
    fs.mkdirSync(path.dirname(windsurfFile), { recursive: true });
    fs.writeFileSync(windsurfFile, "bad");
    expect(() => windsurf.preflight(ctx)).toThrow(/wasn't created/);

    const clineFile = path.join(root, ".clinerules", "sidekick.md");
    fs.mkdirSync(path.dirname(clineFile), { recursive: true });
    fs.writeFileSync(clineFile, "bad");
    expect(() => cline.preflight(ctx)).toThrow(/wasn't created/);

    const jetFile = path.join(root, ".aiassistant", "rules", "sidekick.md");
    fs.mkdirSync(path.dirname(jetFile), { recursive: true });
    fs.writeFileSync(jetFile, "bad");
    expect(() => jetbrains.preflight(ctx)).toThrow(/wasn't created/);

    fs.writeFileSync(path.join(root, "replit.md"), "bad");
    expect(() => replit.preflight(ctx)).toThrow(/wasn't created/);
  });

  it("windsurf and cline adapters preflight detect invalid dirs", () => {
    const registry = adapterRegistry();
    const windsurf = registry.find((a) => a.id === "windsurfRules");
    const cline = registry.find((a) => a.id === "clineRules");
    const ctx = makeContext(root, { windsurfRules: true, clineRules: true, force: false });
    const windsurfDir = path.join(root, ".windsurf");
    const clineDir = path.join(root, ".clinerules");
    fs.writeFileSync(windsurfDir, "file");
    expect(() => windsurf.preflight(ctx)).toThrow(/isn't a directory/);
    fs.rmSync(windsurfDir);
    fs.writeFileSync(clineDir, "file");
    expect(() => cline.preflight(ctx)).toThrow(/isn't a directory/);
  });

  it("jetbrains and replit adapters preflight enforce managed content", () => {
    const registry = adapterRegistry();
    const jetbrains = registry.find((a) => a.id === "jetbrainsRules");
    const replit = registry.find((a) => a.id === "replitMd");
    const ctx = makeContext(root, { jetbrainsRules: true, replitMd: true, force: false });
    const aiDir = path.join(root, ".aiassistant", "rules");
    fs.mkdirSync(aiDir, { recursive: true });
    fs.writeFileSync(path.join(aiDir, "sidekick.md"), "bad");
    expect(() => jetbrains.preflight(ctx)).toThrow(/wasn't created/);
    fs.writeFileSync(path.join(root, "replit.md"), "bad");
    expect(() => replit.preflight(ctx)).toThrow(/wasn't created/);
  });
});
