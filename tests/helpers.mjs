import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function makeTempDir(prefix = "sidekick-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeModule(baseDir, name, options = {}) {
  const dir = path.join(baseDir, name);
  fs.mkdirSync(path.join(dir, "snippets"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    options.skillContent || `---\nname: ${name}\ndescription: ${options.description || "Desc"}\n---\n`
  );
  fs.writeFileSync(
    path.join(dir, "sidekick.module.json"),
    JSON.stringify(options.manifest || { name }, null, 2) + "\n"
  );
  fs.writeFileSync(path.join(dir, "playbook.md"), options.playbook || "# Playbook\n");
  fs.writeFileSync(path.join(dir, "snippets", "kernel.md"), options.kernel || "- Kernel rule\n");
  return dir;
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export { makeTempDir, writeModule, readFile };
