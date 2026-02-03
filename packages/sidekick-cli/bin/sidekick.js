#!/usr/bin/env node
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
let core;
try {
  core = require("@mitche50/sidekick-core");
} catch (err) {
  core = require(path.join(__dirname, "..", "..", "sidekick-core"));
}

const {
  ensureConfig,
  loadConfig,
  saveConfig,
  resolveModule,
  writeAgentsOutputs,
  extractSources,
  mapSourcesToModules,
  promoteModuleKernel,
  loadTelemetry,
  appendTelemetry
} = core;

function usage() {
  console.log(`sidekick <command>  --  your agent's context compiler

Commands:
  init               Set up .sidekick/ config and telemetry
  build              Compile AGENTS.md and the module index
  add <module>       Load a module into your config
  remove <module>    Unload a module from your config
  report             Check which playbooks your agents actually used
  trace module <name> [--files <paths>]   Log module usage
  run [--allow-missing] -- <command>   Wrap an agent run with source tracking
  promote [module] [--top N] [--dry-run]   Promote top kernel rules into your project template
`);
}

function resolveConfiguredModules(root, config) {
  return (config.modules || [])
    .map((name) => resolveModule(root, config, name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function repoRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".sidekick", "config.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (gitRoot.status === 0) {
    return gitRoot.stdout.trim();
  }
  return process.cwd();
}

function ensureGitignore(root) {
  const gitignorePath = path.join(root, ".gitignore");
  const entry = ".sidekick/telemetry/";
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  if (!content.includes(entry)) {
    const prefix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
    fs.writeFileSync(gitignorePath, `${content}${prefix}${entry}\n`);
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function toRegex(pattern) {
  const normalized = normalizePath(pattern);
  const doubleStar = "__SIDEKICK_DS__";
  const doubleStarSlash = "__SIDEKICK_DSS__";
  const singleStar = "__SIDEKICK_SS__";
  const tokenized = normalized
    .replace(/\*\*\//g, doubleStarSlash)
    .replace(/\*\*/g, doubleStar)
    .replace(/\*/g, singleStar);
  const escaped = tokenized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexSource = escaped
    .replace(new RegExp(doubleStarSlash, "g"), "(?:.*/)?")
    .replace(new RegExp(doubleStar, "g"), ".*")
    .replace(new RegExp(singleStar, "g"), "[^/]*");
  return new RegExp(`^${regexSource}$`);
}

function matchesPattern(filePath, pattern) {
  const normalized = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  return toRegex(normalizedPattern).test(normalized);
}

function collectChangedFiles(root) {
  const files = new Set();
  const repoCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (repoCheck.status !== 0) {
    return { files: [], gitAvailable: false };
  }

  const diff = spawnSync("git", ["diff", "--name-only"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (diff.status === 0) {
    diff.stdout.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => files.add(line));
  }

  const staged = spawnSync("git", ["diff", "--name-only", "--staged"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (staged.status === 0) {
    staged.stdout.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => files.add(line));
  }

  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (untracked.status === 0) {
    untracked.stdout.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => files.add(line));
  }

  return { files: Array.from(files), gitAvailable: true };
}

function triggerMatches(trigger, changedFiles) {
  if (!trigger) return false;
  if (typeof trigger === "string") {
    return changedFiles.some((filePath) => matchesPattern(filePath, trigger));
  }
  if (trigger.always === true) return true;

  const paths = Array.isArray(trigger.paths) ? trigger.paths : [];
  const keywords = Array.isArray(trigger.keywords) ? trigger.keywords : [];

  if (paths.length) {
    for (const pattern of paths) {
      if (changedFiles.some((filePath) => matchesPattern(filePath, pattern))) {
        return true;
      }
    }
  }

  if (keywords.length) {
    const haystack = changedFiles.join(" ").toLowerCase();
    if (keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()))) {
      return true;
    }
  }

  return false;
}

function moduleIsExpected(module, changedFiles) {
  const triggers = module.manifest && module.manifest.triggers;
  if (!triggers) return true;
  if (Array.isArray(triggers) && triggers.length === 0) return true;
  const triggerList = Array.isArray(triggers) ? triggers : [triggers];
  return triggerList.some((trigger) => triggerMatches(trigger, changedFiles));
}

function commandInit() {
  const root = repoRoot();
  ensureConfig(root);
  ensureGitignore(root);
  console.log("Ready to go. Config created at .sidekick/config.json");
}

function commandBuild() {
  const root = repoRoot();
  const config = loadConfig(root);
  const modules = resolveConfiguredModules(root, config);
  writeAgentsOutputs(root, config, modules);
  console.log("AGENTS.md compiled. Your agents are now equipped.");
}

function commandAdd(moduleName) {
  if (!moduleName) throw new Error("Module name required");
  const root = repoRoot();
  const config = loadConfig(root);
  resolveModule(root, config, moduleName);
  const modules = new Set(config.modules || []);
  modules.add(moduleName);
  config.modules = Array.from(modules).sort();
  saveConfig(root, config);
  console.log(`Module loaded: ${moduleName}`);
}

function commandRemove(moduleName) {
  if (!moduleName) throw new Error("Module name required");
  const root = repoRoot();
  const config = loadConfig(root);
  config.modules = (config.modules || []).filter((name) => name !== moduleName);
  saveConfig(root, config);
  console.log(`Module unloaded: ${moduleName}`);
}

function commandReport() {
  const root = repoRoot();
  const config = loadConfig(root);
  const usage = loadTelemetry(root);
  const modules = resolveConfiguredModules(root, config);
  const changeInfo = collectChangedFiles(root);
  if (!changeInfo.gitAvailable) {
    console.log("No git detected. Using all configured modules as the opportunity set.");
  }
  const expected = new Set(
    changeInfo.gitAvailable
      ? modules.filter((mod) => moduleIsExpected(mod, changeInfo.files)).map((mod) => mod.name)
      : modules.map((mod) => mod.name)
  );
  const used = new Set(usage.map((event) => event.module).filter(Boolean));
  const overlap = Array.from(expected).filter((mod) => used.has(mod));
  const coverage = expected.size === 0 ? null : overlap.length / expected.size;

  console.log("Sidekick Status Report");
  console.log(`Modules expected: ${expected.size}`);
  console.log(`Modules consulted: ${used.size}`);
  if (coverage == null) {
    console.log("Invocation coverage: N/A");
  } else {
    console.log(`Invocation coverage: ${(coverage * 100).toFixed(0)}%`);
  }
  if (expected.size) {
    const missed = Array.from(expected).filter((mod) => !used.has(mod));
    if (missed.length) {
      console.log(`Went unused: ${missed.join(", ")}`);
    }
  } else if ((config.modules || []).length) {
    console.log("No triggers matched. Nothing expected this session.");
  }
}

function pickModuleForPromotion(modules, usage) {
  const counts = new Map();
  modules.forEach((mod) => counts.set(mod.name, 0));
  usage.forEach((event) => {
    if (counts.has(event.module)) {
      counts.set(event.module, counts.get(event.module) + 1);
    }
  });
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  return sorted.length ? sorted[0][0] : null;
}

function commandPromote(args) {
  const root = repoRoot();
  const config = loadConfig(root);
  const usage = loadTelemetry(root);
  const modules = resolveConfiguredModules(root, config);

  const topIndex = args.indexOf("--top");
  const top = topIndex !== -1 ? Number(args[topIndex + 1]) : 5;
  const dryRun = args.includes("--dry-run");
  let moduleArg = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--top") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    moduleArg = arg;
    break;
  }

  const targetName = moduleArg || pickModuleForPromotion(modules, usage);
  if (!targetName) {
    throw new Error("No module available for promotion.");
  }
  const target = modules.find((mod) => mod.name === targetName);
  if (!target) {
    throw new Error(`Module not found for promotion: ${targetName}`);
  }

  if (dryRun) {
    const lines = promoteModuleKernel(root, config, target, { top, dryRun: true }).added;
    console.log(`Preview -- promoting ${target.name}:`);
    lines.forEach((line) => console.log(line));
    return;
  }

  const result = promoteModuleKernel(root, config, target, { top });
  if (!result.changed) {
    console.log(`Already promoted: ${target.name}. Nothing to do.`);
    return;
  }
  console.log(`Promoted ${result.added.length} rules from ${target.name} into templates/agents-md/kernel.md`);
}

function commandTrace(args) {
  if (args[0] !== "module" || !args[1]) {
    throw new Error("Expected: sidekick trace module <name> [--files <paths>]");
  }
  const root = repoRoot();
  const config = loadConfig(root);
  if (config.telemetry && config.telemetry.enabled === false) {
    console.log("Telemetry disabled; trace skipped.");
    return;
  }
  if (config.telemetry && config.telemetry.mode && config.telemetry.mode !== "local") {
    throw new Error(`Unsupported telemetry mode: ${config.telemetry.mode}`);
  }
  const resolvedModule = resolveModule(root, config, args[1]);
  const moduleName = resolvedModule.name;
  const filesIndex = args.indexOf("--files");
  let files = [];
  if (filesIndex !== -1) {
    files = args.slice(filesIndex + 1);
  }
  appendTelemetry(root, {
    module: moduleName,
    files,
    ts: new Date().toISOString()
  });
  console.log(`Logged: ${moduleName} was consulted.`);
}

function commandRun(args) {
  const separator = args.indexOf("--");
  if (separator === -1 || separator === args.length - 1) {
    throw new Error("Expected: sidekick run -- <command>");
  }
  const preArgs = args.slice(0, separator);
  const command = args[separator + 1];
  const commandArgs = args.slice(separator + 2);
  const allowMissing = preArgs.includes("--allow-missing");

  const root = repoRoot();
  const config = loadConfig(root);
  const telemetry = config.telemetry || {};
  if (telemetry.enabled !== false && telemetry.mode && telemetry.mode !== "local") {
    throw new Error(`Unsupported telemetry mode: ${telemetry.mode}`);
  }
  const modules = (config.modules || []).map((name) => resolveModule(root, config, name));

  const child = spawn(command, commandArgs, {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  const cap = 65536;
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let lastSources = [];
  let tail = "";

  function appendCapped(buffer, text) {
    let next = buffer + text;
    if (next.length > cap) {
      next = next.slice(-cap);
    }
    return next;
  }

  function scanSources(text) {
    tail += text;
    if (tail.length > cap) {
      tail = tail.slice(-cap);
    }
    const lines = tail.split(/\r?\n/);
    tail = lines.pop() || "";
    for (const line of lines) {
      const match = line.match(/^\s*Sources consulted:\s*(.+)\s*$/i);
      if (match) {
        lastSources = match[1]
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
  }

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdoutBuffer = appendCapped(stdoutBuffer, text);
      scanSources(text);
      process.stdout.write(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderrBuffer = appendCapped(stderrBuffer, text);
      scanSources(text);
      process.stderr.write(chunk);
    });
  }

  child.on("error", (err) => {
    console.error(err.message || err);
    process.exit(1);
  });

  child.on("close", (code, signal) => {
    const combined = `${stdoutBuffer}\n${stderrBuffer}`;
    if (tail) {
      const match = tail.match(/^\s*Sources consulted:\s*(.+)\s*$/i);
      if (match) {
        lastSources = match[1]
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
    const sources = lastSources.length ? lastSources : extractSources(combined || "");
    let exitCode;
    if (code != null) {
      exitCode = code;
    } else if (signal) {
      const sigNum = os.constants?.signals?.[signal] || 0;
      exitCode = sigNum ? 128 + sigNum : 1;
    } else {
      exitCode = 1;
    }
    const enforceFailCode = exitCode === 0 ? 1 : exitCode;
    if (sources.length === 0) {
      if (!allowMissing) {
        console.error("Your agent didn't cite its sources. Add a \"Sources consulted\" line to the output.");
        process.exit(enforceFailCode);
        return;
      }
      process.exit(exitCode);
      return;
    }

    const missingSources = sources.filter((src) => {
      const expanded = src.startsWith("~")
        ? (src === "~" ? os.homedir() : path.join(os.homedir(), src.slice(2)))
        : src;
      const abs = path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
      return !fs.existsSync(abs);
    });
    if (missingSources.length && !allowMissing) {
      console.error(`Some cited sources don't exist on disk: ${missingSources.join(", ")}`);
      process.exit(enforceFailCode);
      return;
    }

    const mapped = mapSourcesToModules(root, modules, sources);
    if (mapped.size === 0 && !allowMissing) {
      console.error("Cited sources didn't match any configured modules. Did the agent consult a playbook?");
      process.exit(enforceFailCode);
      return;
    }

    if (config.telemetry && config.telemetry.enabled === false) {
      console.log("Telemetry disabled; trace skipped.");
      process.exit(exitCode);
      return;
    }

    const ts = new Date().toISOString();
    for (const [moduleName, files] of mapped.entries()) {
      appendTelemetry(root, {
        module: moduleName,
        files,
        ts,
        source: "wrapper"
      });
    }

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  });
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      usage();
      return;
    }
    if (command === "init") return commandInit();
    if (command === "build") return commandBuild();
    if (command === "add") return commandAdd(args[1]);
    if (command === "remove") return commandRemove(args[1]);
    if (command === "report") return commandReport();
    if (command === "trace") return commandTrace(args.slice(1));
    if (command === "run") return commandRun(args.slice(1));
    if (command === "promote") return commandPromote(args.slice(1));
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
