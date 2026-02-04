const fs = require("fs");
const os = require("os");
const path = require("path");
let { spawnSync } = require("child_process");

function resolveRepoSpec(repoArg) {
  if (!repoArg) throw new Error("Repo path required.");
  const expandHome = (value) => {
    if (value === "~") return os.homedir();
    if (value.startsWith("~/") || value.startsWith("~\\")) {
      return path.join(os.homedir(), value.slice(2));
    }
    return value;
  };
  const expanded = expandHome(repoArg);
  const localCandidate = path.resolve(expanded);
  if (fs.existsSync(localCandidate)) {
    return { type: "local", path: localCandidate };
  }
  const githubMatch = repoArg.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (githubMatch) {
    const owner = githubMatch[1];
    const repo = githubMatch[2];
    return {
      type: "github",
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}.git`
    };
  }
  return { type: "local", path: localCandidate };
}

function installRepoToCache(spec, destDir) {
  if (fs.existsSync(destDir)) {
    throw new Error(`Repo already installed: ${destDir}`);
  }
  if (spec.type === "github") {
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    const result = spawnSync("git", ["clone", "--depth", "1", spec.url, destDir], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    if (result.status !== 0) {
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      if (result.error && result.error.code === "ENOENT") {
        throw new Error("GitHub installs require `git` to be installed and on PATH.");
      }
      const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
      const errMsg = stderr || (result.error ? result.error.message : "") || "Failed to clone repo.";
      throw new Error(errMsg);
    }
    return;
  }
  if (!fs.existsSync(spec.path)) {
    throw new Error(`Repo path not found: ${spec.path}`);
  }
  if (!fs.statSync(spec.path).isDirectory()) {
    throw new Error(`Repo path is not a directory: ${spec.path}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  try {
    copyDir(spec.path, destDir);
  } catch (err) {
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    throw err;
  }
}

function skillsDirFromRepo(repoPath) {
  const dir = path.join(repoPath, "skills");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error("Repo does not contain a skills/ directory.");
  }
  return dir;
}

function writeInstallMetadata(destDir, meta) {
  const metaPath = path.join(destDir, ".sidekick-install.json");
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}

function readInstallMetadata(destDir) {
  const metaPath = path.join(destDir, ".sidekick-install.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function installSkillsToDir(spec, destDir, options = {}) {
  const force = Boolean(options.force);
  const ref = options.ref || null;
  if (fs.existsSync(destDir)) {
    if (!force) {
      throw new Error(`Target already exists: ${destDir}`);
    }
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });
  let repoPath = null;
  let tempDir = null;
  try {
    if (spec.type === "github") {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-install-"));
      const cloneArgs = ["clone", "--depth", "1"];
      if (ref) {
        cloneArgs.push("--branch", ref, "--single-branch");
      }
      cloneArgs.push(spec.url, tempDir);
      const result = spawnSync("git", cloneArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8"
      });
      if (result.status !== 0) {
        const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
        const errMsg = stderr || (result.error ? result.error.message : "") || "Failed to clone repo.";
        throw new Error(errMsg);
      }
      repoPath = tempDir;
    } else {
      repoPath = spec.path;
    }
    const skillsDir = skillsDirFromRepo(repoPath);
    copyDirContents(skillsDir, destDir);
    writeInstallMetadata(destDir, {
      source: spec.type,
      repo: spec.type === "github" ? `${spec.owner}/${spec.repo}` : repoPath,
      ref
    });
  } catch (err) {
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    throw err;
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function copyDirContents(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  entries.forEach((entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  entries.forEach((entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

function discoverSkills(root) {
  const skills = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const rootSkill = path.join(root, "SKILL.md");
  if (fs.existsSync(rootSkill)) {
    skills.push(path.basename(root));
  }
  entries.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const dir = path.join(root, entry.name);
    if (fs.existsSync(path.join(dir, "SKILL.md"))) {
      skills.push(entry.name);
    }
  });
  return skills;
}

module.exports = {
  resolveRepoSpec,
  installRepoToCache,
  installSkillsToDir,
  readInstallMetadata,
  discoverSkills,
  discoverSkillsInRepo(repoPath) {
    const direct = discoverSkills(repoPath);
    if (direct.length) return { root: repoPath, skills: direct };
    const nested = path.join(repoPath, "skills");
    if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
      const nestedSkills = discoverSkills(nested);
      if (nestedSkills.length) return { root: nested, skills: nestedSkills };
    }
    return { root: repoPath, skills: [] };
  },
  _internal: {
    setSpawnSyncForTests(fn) {
      spawnSync = fn;
    }
  }
};
