const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { adapterRegistry, getEnabledAdapters } = require("./adapters");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

function isManagedGeminiSettingsContent(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    if (
      parsed.context &&
      typeof parsed.context === "object" &&
      parsed.context.fileName === "AGENTS.md" &&
      Object.keys(parsed).length === 1 &&
      Object.keys(parsed.context).length === 1
    ) {
      return true;
    }
    if (parsed.contextFileName === "AGENTS.md" && Object.keys(parsed).length === 1) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function expandHome(dirPath) {
  if (dirPath === "~") return os.homedir();
  if (dirPath.startsWith("~/") || dirPath.startsWith("~\\")) {
    return path.join(os.homedir(), dirPath.slice(2));
  }
  return dirPath;
}

function isSafeModuleName(moduleName) {
  return /^[a-z0-9][a-z0-9-]*$/.test(moduleName);
}

function isSafeAdapterFilename(name) {
  if (typeof name !== "string") return false;
  if (name === "." || name === "..") return false;
  if (path.isAbsolute(name)) return false;
  if (name !== path.basename(name)) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "AGENTS.md") return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

function isManagedSymlink(linkPath, agentsMdPath) {
  try {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) return false;
    const target = fs.readlinkSync(linkPath);
    const resolved = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(linkPath), target);
    const targetReal = fs.realpathSync(resolved);
    const agentsReal = fs.realpathSync(agentsMdPath);
    if (process.platform === "win32") {
      return targetReal.toLowerCase() === agentsReal.toLowerCase();
    }
    return targetReal === agentsReal;
  } catch {
    return false;
  }
}

function resolveEntryPath(moduleDir, relPath, label) {
  const resolved = path.resolve(moduleDir, relPath);
  const base = path.resolve(moduleDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Invalid ${label} path; must stay within module: ${relPath}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing ${label} file: ${relPath}`);
  }
  const baseReal = fs.realpathSync(base);
  const fileReal = fs.realpathSync(resolved);
  if (fileReal !== baseReal && !fileReal.startsWith(baseReal + path.sep)) {
    throw new Error(`Invalid ${label} path; resolves outside module: ${relPath}`);
  }
  if (!fs.statSync(fileReal).isFile()) {
    throw new Error(`Invalid ${label} path; not a file: ${relPath}`);
  }
  return resolved;
}

function formatIndexPath(root, filePath) {
  const rootAbs = path.resolve(root);
  const targetAbs = path.resolve(filePath);
  const rel = path.relative(rootAbs, targetAbs);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return normalizePath(rel);
  }
  return normalizePath(targetAbs);
}

function resolveModuleSearchDirs(root, config) {
  const rawDirs = Array.isArray(config.moduleDirs) && config.moduleDirs.length
    ? config.moduleDirs
    : [
        path.join(root, ".agents", "skills"),
        path.join(os.homedir(), ".agents", "skills"),
        root
      ];

  return rawDirs.map((dir) => {
    const expanded = expandHome(dir);
    if (path.isAbsolute(expanded)) {
      return expanded;
    }
    return path.resolve(root, expanded);
  });
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function gitHeadForPath(dirPath) {
  const result = spawnSync("git", ["-C", dirPath, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function extractSources(output) {
  const matches = output.match(/^\s*Sources consulted:\s*(.+)\s*$/gim);
  if (!matches || matches.length === 0) return [];
  const last = matches[matches.length - 1];
  const list = last.replace(/Sources consulted:\s*/i, "");
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapSourcesToModules(root, modules, sources) {
  const results = new Map();
  const resolvedSources = sources.map((source) => {
    const expanded = source.startsWith("~") ? expandHome(source) : source;
    const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
    let resolvedPath = path.resolve(resolved);
    if (!fs.existsSync(resolvedPath)) {
      return { raw: source, resolved: null };
    }
    try {
      resolvedPath = fs.realpathSync(resolvedPath);
    } catch {
      // ignore realpath failures
    }
    if (process.platform === "win32") {
      resolvedPath = resolvedPath.toLowerCase();
    }
    return { raw: source, resolved: resolvedPath };
  });

  for (const mod of modules) {
    let modRoot = path.resolve(mod.dir);
    if (fs.existsSync(modRoot)) {
      try {
        modRoot = fs.realpathSync(modRoot);
      } catch {
        // ignore realpath failures
      }
    }
    if (process.platform === "win32") {
      modRoot = modRoot.toLowerCase();
    }
    const modSources = [];
    for (const src of resolvedSources) {
      if (!src.resolved) continue;
      if (src.resolved === modRoot || src.resolved.startsWith(modRoot + path.sep)) {
        modSources.push(src.raw);
        continue;
      }
      const normalize = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
      const playbookPath = normalize(path.resolve(mod.playbookPath));
      const kernelPath = normalize(path.resolve(mod.kernelPath));
      const skillPath = normalize(path.resolve(mod.skillPath));
      if (src.resolved === playbookPath) modSources.push(src.raw);
      if (src.resolved === kernelPath) modSources.push(src.raw);
      if (src.resolved === skillPath) modSources.push(src.raw);
    }
    if (modSources.length) {
      results.set(mod.name, modSources);
    }
  }

  return results;
}

function defaultConfig() {
  return {
    version: 1,
    modules: [],
    moduleDirs: ["./.agents/skills", "~/.agents/skills", "."],
    adapters: {
      agentsMd: true,
      symlinkFiles: ["AGENT.md", "GEMINI.md"],
      aiderConf: true,
      geminiSettings: true,
      force: false
    },
    budgets: {
      agentsMdKernelMaxBytes: 10000,
      indexMaxBytes: 12000
    },
    telemetry: {
      enabled: true,
      mode: "local"
    }
  };
}

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config: expected an object.");
  }

  if (config.modules != null) {
    if (!Array.isArray(config.modules)) {
      throw new Error("Invalid config.modules: expected an array.");
    }
    config.modules.forEach((name) => {
      if (typeof name !== "string" || !isSafeModuleName(name)) {
        throw new Error(`Invalid module name in config.modules: ${name}`);
      }
    });
  }

  if (config.moduleDirs != null) {
    if (!Array.isArray(config.moduleDirs) || !config.moduleDirs.every((dir) => typeof dir === "string")) {
      throw new Error("Invalid config.moduleDirs: expected an array of strings.");
    }
  }

  if (config.adapters != null) {
    if (typeof config.adapters !== "object") {
      throw new Error("Invalid config.adapters: expected an object.");
    }
    const { symlinkFiles } = config.adapters;
    if (symlinkFiles != null) {
      if (!Array.isArray(symlinkFiles)) {
        throw new Error("Invalid adapters.symlinkFiles: expected an array.");
      }
      symlinkFiles.forEach((name) => {
        if (typeof name !== "string" || !isSafeAdapterFilename(name)) {
          throw new Error(`Invalid adapter filename in adapters.symlinkFiles: ${name}`);
        }
      });
    }
    ["agentsMd", "aiderConf", "geminiSettings", "force"].forEach((key) => {
      if (config.adapters[key] != null && typeof config.adapters[key] !== "boolean") {
        throw new Error(`Invalid adapters.${key}: expected a boolean.`);
      }
    });
  }

  if (config.budgets != null) {
    if (typeof config.budgets !== "object") {
      throw new Error("Invalid config.budgets: expected an object.");
    }
    ["agentsMdKernelMaxBytes", "indexMaxBytes"].forEach((key) => {
      if (config.budgets[key] != null && (typeof config.budgets[key] !== "number" || config.budgets[key] < 0)) {
        throw new Error(`Invalid budgets.${key}: expected a non-negative number.`);
      }
    });
  }

  if (config.telemetry != null) {
    if (typeof config.telemetry !== "object") {
      throw new Error("Invalid config.telemetry: expected an object.");
    }
    if (config.telemetry.enabled != null && typeof config.telemetry.enabled !== "boolean") {
      throw new Error("Invalid telemetry.enabled: expected a boolean.");
    }
    if (config.telemetry.enabled !== false && config.telemetry.mode != null && config.telemetry.mode !== "local") {
      throw new Error(`Unsupported telemetry mode: ${config.telemetry.mode}`);
    }
  }

  return config;
}

function sidekickDir(root) {
  return path.join(root, ".sidekick");
}

function configPath(root) {
  return path.join(sidekickDir(root), "config.json");
}

function telemetryDir(root) {
  return path.join(sidekickDir(root), "telemetry");
}

function ensureConfig(root) {
  ensureDir(sidekickDir(root));
  ensureDir(telemetryDir(root));
  const cfgPath = configPath(root);
  if (!fs.existsSync(cfgPath)) {
    writeJson(cfgPath, defaultConfig());
  }
  return validateConfig(readJson(cfgPath));
}

function loadConfig(root) {
  const cfgPath = configPath(root);
  if (!fs.existsSync(cfgPath)) {
    throw new Error("No config found. Run `sidekick init` to get started.");
  }
  return validateConfig(readJson(cfgPath));
}

function saveConfig(root, config) {
  ensureDir(sidekickDir(root));
  writeJson(configPath(root), validateConfig(config));
}

function resolveModule(root, config, moduleName) {
  if (!isSafeModuleName(moduleName)) {
    throw new Error(`Invalid module name: ${moduleName}`);
  }

  const searchDirs = resolveModuleSearchDirs(root, config);
  let moduleDir = null;
  let manifestPath = null;
  for (const dir of searchDirs) {
    const candidateDir = path.join(dir, moduleName);
    const candidateManifest = path.join(candidateDir, "sidekick.module.json");
    if (fs.existsSync(candidateManifest)) {
      moduleDir = candidateDir;
      manifestPath = candidateManifest;
      break;
    }
  }

  if (!moduleDir || !manifestPath) {
    throw new Error(`Module not found: ${moduleName}`);
  }

  const manifest = readJson(manifestPath);
  if (manifest.name != null) {
    if (typeof manifest.name !== "string" || !isSafeModuleName(manifest.name)) {
      throw new Error(`Invalid manifest.name in ${manifestPath}`);
    }
    if (manifest.name !== moduleName) {
      throw new Error(`manifest.name must match directory name: ${moduleName}`);
    }
  }
  const playbookRel = manifest.entrypoints?.playbook || "playbook.md";
  const kernelRel = manifest.entrypoints?.kernel || "snippets/kernel.md";
  const skillRel = manifest.entrypoints?.skill || "SKILL.md";

  const playbookPath = resolveEntryPath(moduleDir, playbookRel, "playbook");
  const kernelPath = resolveEntryPath(moduleDir, kernelRel, "kernel");
  const skillPath = resolveEntryPath(moduleDir, skillRel, "skill");

  if (!fs.existsSync(skillPath)) {
    throw new Error(`Missing SKILL.md for module: ${moduleName}`);
  }
  if (!fs.existsSync(playbookPath)) {
    throw new Error(`Missing playbook.md for module: ${moduleName}`);
  }
  if (!fs.existsSync(kernelPath)) {
    throw new Error(`Missing snippets/kernel.md for module: ${moduleName}`);
  }

  return {
    name: manifest.name || moduleName,
    description: manifest.description || "",
    dir: moduleDir,
    manifest,
    manifestPath,
    playbookPath,
    kernelPath,
    skillPath
  };
}

function readOptional(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function readKernelSnippetLines(filePath, top) {
  const raw = readOptional(filePath);
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => line.startsWith("- ") || line.startsWith("* "));
  const selected = (bulletLines.length ? bulletLines : lines).slice(0, top);
  return selected;
}

function promoteModuleKernel(root, config, module, options = {}) {
  const top = Number.isFinite(options.top) ? options.top : 5;
  const templateDir = path.join(root, "templates", "agents-md");
  const templatePath = path.join(templateDir, "kernel.md");
  const existing = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, "utf8") : loadKernelTemplate(root);

  const snippetLines = readKernelSnippetLines(module.kernelPath, top);
  if (snippetLines.length === 0) {
    throw new Error(`No kernel snippet lines found for module: ${module.name}`);
  }

  const promotedHeader = "## Promoted Rules";
  const moduleHeader = `### ${module.name}`;
  let updated = existing;

  if (!updated.includes(promotedHeader)) {
    updated = `${updated.trimEnd()}\n\n${promotedHeader}\n`;
  }

  const existingLines = new Set(updated.split(/\r?\n/).map((line) => line.trim()));
  const toAdd = snippetLines.filter((line) => !existingLines.has(line));

  if (updated.includes(moduleHeader)) {
    if (toAdd.length === 0) {
      return { updated, changed: false, added: [] };
    }
    const lines = updated.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => line.trim() === moduleHeader);
    if (headerIndex === -1) {
      return { updated, changed: false, added: [] };
    }
    let insertIndex = headerIndex + 1;
    while (insertIndex < lines.length) {
      const line = lines[insertIndex];
      if (/^##\s+/.test(line) || /^###\s+/.test(line)) break;
      insertIndex += 1;
    }
    lines.splice(insertIndex, 0, ...toAdd);
    updated = `${lines.join("\n").trimEnd()}\n`;
  } else {
    if (toAdd.length === 0) {
      return { updated, changed: false, added: [] };
    }
    const block = `\n${moduleHeader}\n${toAdd.join("\n")}\n`;
    updated = `${updated.trimEnd()}${block}`;
  }

  const budgets = config.budgets || {};
  const configuredModules = (config.modules || []).map((name) => resolveModule(root, config, name));
  const kernelBlocks = configuredModules
    .map((mod) => {
      const snippet = readOptional(mod.kernelPath).trim();
      if (!snippet) return "";
      return `\n\n### ${mod.name}\n${snippet}`;
    })
    .filter(Boolean)
    .join("");
  const kernelContent = `${updated.trimEnd()}${kernelBlocks}`;
  if (budgets.agentsMdKernelMaxBytes != null) {
    const kernelSize = Buffer.byteLength(kernelContent, "utf8");
    if (kernelSize > budgets.agentsMdKernelMaxBytes) {
      throw new Error(`Kernel budget exceeded after promotion: ${kernelSize} > ${budgets.agentsMdKernelMaxBytes}`);
    }
  }

  if (!options.dryRun) {
    ensureDir(templateDir);
    fs.writeFileSync(templatePath, `${updated.trimEnd()}\n`);
  }
  return { updated, changed: true, added: toAdd };
}

function defaultKernelTemplate() {
  return `# AGENTS.md\n\n## Kernel\n- Prefer retrieval-led reasoning over pre-training-led reasoning. Consult indexed playbooks/docs first.\n- Keep changes scoped, verify with tests or checks when available, and report results.\n- Record playbook usage with \`sidekick trace module <name> --files <paths>\` when a playbook is used.\n- Include a brief \"Sources consulted\" line in your final response.\n`;
}

function loadKernelTemplate(root) {
  const templatePath = path.join(root, "templates", "agents-md", "kernel.md");
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, "utf8");
  }
  const packageTemplate = path.resolve(__dirname, "templates", "agents-md", "kernel.md");
  if (fs.existsSync(packageTemplate)) {
    return fs.readFileSync(packageTemplate, "utf8");
  }
  const repoTemplate = path.resolve(__dirname, "..", "..", "templates", "agents-md", "kernel.md");
  if (fs.existsSync(repoTemplate)) {
    return fs.readFileSync(repoTemplate, "utf8");
  }
  return defaultKernelTemplate();
}

function buildIndexEntries(modules, root) {
  const entries = [];
  for (const mod of modules) {
    const modulePath = formatIndexPath(root, mod.dir);
    const files = [
      formatIndexPath(root, mod.playbookPath),
      formatIndexPath(root, mod.kernelPath),
      formatIndexPath(root, mod.skillPath)
    ];
    entries.push(`${modulePath}|${files.join(",")}`);
  }
  return entries.join("\n") + (entries.length ? "\n" : "");
}

function buildAgentsParts(root, modules) {
  const kernelTemplate = loadKernelTemplate(root).trimEnd();
  const kernelBlocks = modules
    .map((mod) => {
      const snippet = readOptional(mod.kernelPath).trim();
      if (!snippet) return "";
      return `\n\n### ${mod.name}\n${snippet}`;
    })
    .filter(Boolean)
    .join("");

  const index = buildIndexEntries(modules, root).trimEnd();
  const kernelContent = `${kernelTemplate}${kernelBlocks}`;
  const agentsContent = `${kernelContent}\n\n## Index\n\nUse the index to locate playbooks and supporting docs.\n\n\`\`\`\n${index}\n\`\`\`\n`;
  return { kernelContent, indexContent: index, agentsContent };
}

function buildAgentsMdContent(root, modules) {
  return buildAgentsParts(root, modules).agentsContent;
}

function validateBudgets(budgets, parts, modules) {
  const kernelLimit = budgets.agentsMdKernelMaxBytes;
  if (kernelLimit != null) {
    if (typeof kernelLimit !== "number" || Number.isNaN(kernelLimit) || kernelLimit < 0) {
      throw new Error("Invalid agentsMdKernelMaxBytes budget value.");
    }
    const kernelSize = Buffer.byteLength(parts.kernelContent, "utf8");
    if (kernelSize > kernelLimit) {
      const offenders = modules
        .map((mod) => {
          const snippet = readOptional(mod.kernelPath).trim();
          const size = Buffer.byteLength(`### ${mod.name}\n${snippet}`, "utf8");
          return { name: mod.name, size };
        })
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)
        .map((item) => `${item.name}=${item.size}B`)
        .join(", ");
      throw new Error(`Kernel budget exceeded: ${kernelSize} > ${kernelLimit}. Largest kernels: ${offenders}`);
    }
  }

  const indexLimit = budgets.indexMaxBytes;
  if (indexLimit != null) {
    if (typeof indexLimit !== "number" || Number.isNaN(indexLimit) || indexLimit < 0) {
      throw new Error("Invalid indexMaxBytes budget value.");
    }
    const indexSize = Buffer.byteLength(parts.indexContent, "utf8");
    if (indexSize > indexLimit) {
      const lines = parts.indexContent.split("\n").filter(Boolean);
      const offenders = lines
        .map((line) => ({ line, size: Buffer.byteLength(line, "utf8") }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)
        .map((item) => `${item.line}=${item.size}B`)
        .join(" | ");
      throw new Error(`Index budget exceeded: ${indexSize} > ${indexLimit}. Largest entries: ${offenders}`);
    }
  }
}

function writeLockFile(root, modules) {
  const lockPath = path.join(sidekickDir(root), "sidekick.lock.json");
  const lock = {
    version: 1,
    modules: modules
      .slice()
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((mod) => {
        const files = [
          mod.manifestPath,
          mod.skillPath,
          mod.playbookPath,
          mod.kernelPath
        ].map((filePath) => ({
          path: normalizePath(path.relative(mod.dir, filePath)),
          sha256: hashFile(filePath)
        }));
        const gitHead = gitHeadForPath(mod.dir);
        return {
          name: mod.name,
          source: "filesystem",
          dir: formatIndexPath(root, mod.dir),
          files,
          gitHead
        };
      })
  };
  writeJson(lockPath, lock);
}

function writeAgentsOutputs(root, config, modules) {
  const agentsMdPath = path.join(root, "AGENTS.md");
  const prevAgentsContent = fs.existsSync(agentsMdPath) ? fs.readFileSync(agentsMdPath, "utf8") : null;
  const indexPath = path.join(sidekickDir(root), "index.min.txt");
  const parts = buildAgentsParts(root, modules);
  const marker = "<!-- sidekick:generated -->\n";
  const agentsContent = parts.agentsContent.startsWith(marker)
    ? parts.agentsContent
    : `${marker}${parts.agentsContent}`;
  const indexContent = parts.indexContent;

  validateBudgets(config.budgets || {}, parts, modules);

  const adapters = config.adapters || {};
  const registry = adapterRegistry();
  const enabledAdapters = getEnabledAdapters(config, registry);
  const needsAgentsMd = Boolean(adapters.agentsMd) || enabledAdapters.some((adapter) => adapter.requiresAgentsMd);

  const isManagedCopy = (filePath) => {
    const current = normalizeNewlines(fs.readFileSync(filePath, "utf8"));
    const next = normalizeNewlines(agentsContent);
    if (current === next) return true;
    if (prevAgentsContent != null && current === normalizeNewlines(prevAgentsContent)) {
      return true;
    }
    return false;
  };

  const adapterContext = {
    fs,
    path,
    root,
    adapters,
    agentsMdPath,
    agentsContent,
    prevAgentsContent,
    normalizeNewlines,
    isSafeAdapterFilename,
    isManagedSymlink,
    isManagedCopy,
    isManagedGeminiSettingsContent,
    ensureDir
  };

  // Preflight adapter safety before writing outputs.
  enabledAdapters.forEach((adapter) => adapter.preflight(adapterContext));

  if (needsAgentsMd) {
    if (fs.existsSync(agentsMdPath) && !normalizeNewlines(fs.readFileSync(agentsMdPath, "utf8")).includes("<!-- sidekick:generated -->") && !adapters.force) {
      throw new Error("Existing AGENTS.md wasn't created by Sidekick. Set adapters.force to override.");
    }
  }

  ensureDir(sidekickDir(root));
  if (indexContent) {
    const withNewline = indexContent.endsWith("\n") ? indexContent : `${indexContent}\n`;
    fs.writeFileSync(indexPath, withNewline);
  } else {
    fs.writeFileSync(indexPath, "");
  }

  if (needsAgentsMd) {
    fs.writeFileSync(agentsMdPath, agentsContent);
  }
  writeLockFile(root, modules);

  enabledAdapters.forEach((adapter) => adapter.write(adapterContext));
}

function loadTelemetry(root) {
  const usagePath = path.join(telemetryDir(root), "usage.jsonl");
  if (!fs.existsSync(usagePath)) return [];
  const raw = fs.readFileSync(usagePath, "utf8").trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function appendTelemetry(root, event) {
  ensureDir(telemetryDir(root));
  const usagePath = path.join(telemetryDir(root), "usage.jsonl");
  fs.appendFileSync(usagePath, JSON.stringify(event) + "\n");
}

module.exports = {
  defaultConfig,
  ensureConfig,
  loadConfig,
  saveConfig,
  resolveModule,
  buildAgentsMdContent,
  extractSources,
  mapSourcesToModules,
  promoteModuleKernel,
  writeAgentsOutputs,
  buildIndexEntries,
  loadTelemetry,
  appendTelemetry
};
