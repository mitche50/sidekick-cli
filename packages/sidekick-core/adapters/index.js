function getEnabledAdapters(config, registry) {
  const adapters = registry || [];
  return adapters.filter((adapter) => {
    if (typeof adapter.isEnabled === "function") {
      return adapter.isEnabled(config);
    }
    return false;
  });
}

function adapterRegistry() {
  return [
    {
      id: "symlinkFiles",
      requiresAgentsMd: true,
      isEnabled: (config) => Array.isArray(config.adapters?.symlinkFiles) && config.adapters.symlinkFiles.length > 0,
      preflight(ctx) {
        const names = ctx.adapters.symlinkFiles || [];
        names.forEach((name) => {
          if (!ctx.isSafeAdapterFilename(name)) {
            throw new Error(`Invalid adapter filename: ${name}`);
          }
          const linkPath = ctx.path.join(ctx.root, name);
          if (!ctx.fs.existsSync(linkPath)) return;
          let safe = false;
          try {
            if (ctx.isManagedSymlink(linkPath, ctx.agentsMdPath)) {
              safe = true;
            } else {
              safe = ctx.isManagedCopy(linkPath);
            }
          } catch {
            safe = false;
          }
          if (!safe && !ctx.adapters.force) {
            throw new Error(`Won't overwrite ${name} -- it wasn't created by Sidekick. Set adapters.force to override.`);
          }
        });
      },
      write(ctx) {
        const names = ctx.adapters.symlinkFiles || [];
        names.forEach((name) => {
          if (!ctx.isSafeAdapterFilename(name)) {
            throw new Error(`Invalid adapter filename: ${name}`);
          }
          const linkPath = ctx.path.join(ctx.root, name);
          const existing = ctx.fs.existsSync(linkPath);
          if (existing) {
            let isSafe = false;
            try {
              if (ctx.isManagedSymlink(linkPath, ctx.agentsMdPath)) {
                isSafe = true;
              } else if (ctx.normalizeNewlines(ctx.fs.readFileSync(linkPath, "utf8")) === ctx.normalizeNewlines(ctx.agentsContent)) {
                isSafe = true;
              } else if (ctx.prevAgentsContent != null && ctx.normalizeNewlines(ctx.fs.readFileSync(linkPath, "utf8")) === ctx.normalizeNewlines(ctx.prevAgentsContent)) {
                isSafe = true;
              }
            } catch {
              isSafe = false;
            }
            if (!isSafe && !ctx.adapters.force) {
              throw new Error(`Won't overwrite ${name} -- it wasn't created by Sidekick. Set adapters.force to override.`);
            }
            try {
              ctx.fs.unlinkSync(linkPath);
            } catch (err) {
              if (!err || err.code !== "ENOENT") {
                throw err;
              }
            }
          }
          try {
            ctx.fs.symlinkSync("AGENTS.md", linkPath);
          } catch (err) {
            try {
              ctx.fs.copyFileSync(ctx.agentsMdPath, linkPath);
            } catch (copyErr) {
              throw new Error(`Failed to create adapter ${name}: ${copyErr.message}`);
            }
          }
        });
      }
    },
    {
      id: "aiderConf",
      requiresAgentsMd: true,
      isEnabled: (config) => Boolean(config.adapters?.aiderConf),
      preflight(ctx) {
        const aiderPath = ctx.path.join(ctx.root, ".aider.conf.yml");
        const desired = "read: AGENTS.md\n";
        if (ctx.fs.existsSync(aiderPath) && ctx.normalizeNewlines(ctx.fs.readFileSync(aiderPath, "utf8")) !== ctx.normalizeNewlines(desired)) {
          if (!ctx.adapters.force) {
            throw new Error("Existing .aider.conf.yml wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const aiderPath = ctx.path.join(ctx.root, ".aider.conf.yml");
        const desired = "read: AGENTS.md\n";
        if (ctx.fs.existsSync(aiderPath) && ctx.normalizeNewlines(ctx.fs.readFileSync(aiderPath, "utf8")) !== ctx.normalizeNewlines(desired)) {
          if (!ctx.adapters.force) {
            throw new Error("Existing .aider.conf.yml wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
        ctx.fs.writeFileSync(aiderPath, desired);
      }
    },
    {
      id: "geminiSettings",
      requiresAgentsMd: true,
      isEnabled: (config) => Boolean(config.adapters?.geminiSettings),
      preflight(ctx) {
        const geminiDir = ctx.path.join(ctx.root, ".gemini");
        if (ctx.fs.existsSync(geminiDir) && !ctx.fs.statSync(geminiDir).isDirectory()) {
          throw new Error(".gemini exists but isn't a directory.");
        }
        const settingsPath = ctx.path.join(geminiDir, "settings.json");
        if (ctx.fs.existsSync(settingsPath)) {
          const raw = ctx.fs.readFileSync(settingsPath, "utf8");
          if (!ctx.isManagedGeminiSettingsContent(raw) && !ctx.adapters.force) {
            throw new Error("Existing .gemini/settings.json wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const geminiDir = ctx.path.join(ctx.root, ".gemini");
        const settingsPath = ctx.path.join(geminiDir, "settings.json");
        const desiredObject = { context: { fileName: "AGENTS.md" } };
        const desired = JSON.stringify(desiredObject, null, 2) + "\n";
        if (ctx.fs.existsSync(settingsPath)) {
          const raw = ctx.fs.readFileSync(settingsPath, "utf8");
          if (!ctx.isManagedGeminiSettingsContent(raw) && !ctx.adapters.force) {
            throw new Error("Existing .gemini/settings.json wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
        if (ctx.fs.existsSync(geminiDir) && !ctx.fs.statSync(geminiDir).isDirectory()) {
          throw new Error(".gemini exists but isn't a directory.");
        }
        ctx.ensureDir(geminiDir);
        ctx.fs.writeFileSync(settingsPath, desired);
      }
    },
    {
      id: "copilotInstructions",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.copilotInstructions),
      preflight(ctx) {
        const dir = ctx.path.join(ctx.root, ".github");
        assertDirOrMissing(ctx, dir, ".github");
        const filePath = ctx.path.join(dir, "copilot-instructions.md");
        if (ctx.fs.existsSync(filePath)) {
          const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
          if (current !== ctx.normalizeNewlines(buildInstructionContent(ctx)) && !ctx.adapters.force) {
            throw new Error("Existing .github/copilot-instructions.md wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const dir = ctx.path.join(ctx.root, ".github");
        const filePath = ctx.path.join(dir, "copilot-instructions.md");
        ctx.ensureDir(dir);
        ctx.fs.writeFileSync(filePath, buildInstructionContent(ctx));
      }
    },
    {
      id: "claudeMd",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.claudeMd),
      preflight(ctx) {
        const filePath = ctx.path.join(ctx.root, "CLAUDE.md");
        if (ctx.fs.existsSync(filePath)) {
          let safe = false;
          try {
            if (ctx.isManagedSymlink(filePath, ctx.agentsMdPath)) {
              safe = true;
            } else if (ctx.isManagedCopy(filePath)) {
              safe = true;
            } else {
              const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
              if (current === ctx.normalizeNewlines(buildInstructionContent(ctx))) {
                safe = true;
              }
            }
          } catch {
            safe = false;
          }
          if (!safe && !ctx.adapters.force) {
            throw new Error("Existing CLAUDE.md wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const filePath = ctx.path.join(ctx.root, "CLAUDE.md");
        if (ctx.adapters.claudeMdSymlink) {
          if (ctx.fs.existsSync(filePath)) {
            try {
              ctx.fs.unlinkSync(filePath);
            } catch (err) {
              if (!err || err.code !== "ENOENT") {
                throw err;
              }
            }
          }
          try {
            ctx.fs.symlinkSync("AGENTS.md", filePath);
          } catch (err) {
            try {
              ctx.fs.copyFileSync(ctx.agentsMdPath, filePath);
            } catch (copyErr) {
              throw new Error(`Failed to create adapter CLAUDE.md: ${copyErr.message}`);
            }
          }
          return;
        }
        ctx.fs.writeFileSync(filePath, buildInstructionContent(ctx));
      }
    },
    {
      id: "cursorRules",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.cursorRules),
      preflight(ctx) {
        const cursorDir = ctx.path.join(ctx.root, ".cursor");
        const dir = ctx.path.join(cursorDir, "rules");
        assertDirOrMissing(ctx, cursorDir, ".cursor");
        assertDirOrMissing(ctx, dir, ".cursor/rules");
        const filePath = ctx.path.join(dir, "sidekick.mdc");
        if (ctx.fs.existsSync(filePath)) {
          const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
          if (current !== ctx.normalizeNewlines(buildCursorRuleContent(ctx)) && !ctx.adapters.force) {
            throw new Error("Existing .cursor/rules/sidekick.mdc wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const dir = ctx.path.join(ctx.root, ".cursor", "rules");
        const filePath = ctx.path.join(dir, "sidekick.mdc");
        ctx.ensureDir(dir);
        ctx.fs.writeFileSync(filePath, buildCursorRuleContent(ctx));
      }
    },
    {
      id: "windsurfRules",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.windsurfRules),
      preflight(ctx) {
        const windsurfDir = ctx.path.join(ctx.root, ".windsurf");
        const dir = ctx.path.join(windsurfDir, "rules");
        assertDirOrMissing(ctx, windsurfDir, ".windsurf");
        assertDirOrMissing(ctx, dir, ".windsurf/rules");
        const filePath = ctx.path.join(dir, "sidekick.md");
        if (ctx.fs.existsSync(filePath)) {
          const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
          if (current !== ctx.normalizeNewlines(buildInstructionContent(ctx)) && !ctx.adapters.force) {
            throw new Error("Existing .windsurf/rules/sidekick.md wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const dir = ctx.path.join(ctx.root, ".windsurf", "rules");
        const filePath = ctx.path.join(dir, "sidekick.md");
        ctx.ensureDir(dir);
        ctx.fs.writeFileSync(filePath, buildInstructionContent(ctx));
      }
    },
    {
      id: "clineRules",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.clineRules),
      preflight(ctx) {
        const dir = ctx.path.join(ctx.root, ".clinerules");
        assertDirOrMissing(ctx, dir, ".clinerules");
        const filePath = ctx.path.join(dir, "sidekick.md");
        if (ctx.fs.existsSync(filePath)) {
          const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
          if (current !== ctx.normalizeNewlines(buildInstructionContent(ctx)) && !ctx.adapters.force) {
            throw new Error("Existing .clinerules/sidekick.md wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const dir = ctx.path.join(ctx.root, ".clinerules");
        const filePath = ctx.path.join(dir, "sidekick.md");
        ctx.ensureDir(dir);
        ctx.fs.writeFileSync(filePath, buildInstructionContent(ctx));
      }
    },
    {
      id: "jetbrainsRules",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.jetbrainsRules),
      preflight(ctx) {
        const aiDir = ctx.path.join(ctx.root, ".aiassistant");
        const dir = ctx.path.join(aiDir, "rules");
        assertDirOrMissing(ctx, aiDir, ".aiassistant");
        assertDirOrMissing(ctx, dir, ".aiassistant/rules");
        const filePath = ctx.path.join(dir, "sidekick.md");
        if (ctx.fs.existsSync(filePath)) {
          const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
          if (current !== ctx.normalizeNewlines(buildInstructionContent(ctx)) && !ctx.adapters.force) {
            throw new Error("Existing .aiassistant/rules/sidekick.md wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const dir = ctx.path.join(ctx.root, ".aiassistant", "rules");
        const filePath = ctx.path.join(dir, "sidekick.md");
        ctx.ensureDir(dir);
        ctx.fs.writeFileSync(filePath, buildInstructionContent(ctx));
      }
    },
    {
      id: "replitMd",
      requiresAgentsMd: false,
      isEnabled: (config) => Boolean(config.adapters?.replitMd),
      preflight(ctx) {
        const filePath = ctx.path.join(ctx.root, "replit.md");
        if (ctx.fs.existsSync(filePath)) {
          const current = ctx.normalizeNewlines(ctx.fs.readFileSync(filePath, "utf8"));
          if (current !== ctx.normalizeNewlines(buildInstructionContent(ctx)) && !ctx.adapters.force) {
            throw new Error("Existing replit.md wasn't created by Sidekick. Set adapters.force to override.");
          }
        }
      },
      write(ctx) {
        const filePath = ctx.path.join(ctx.root, "replit.md");
        ctx.fs.writeFileSync(filePath, buildInstructionContent(ctx));
      }
    }
  ];
}

function assertDirOrMissing(ctx, dirPath, label) {
  if (ctx.fs.existsSync(dirPath) && !ctx.fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} exists but isn't a directory.`);
  }
}

function buildInstructionContent(ctx) {
  const body = ctx.stripAgentsHeader(ctx.kernelContent).trim();
  return `# Sidekick Instructions\n\n${body}\n`;
}

function buildCursorRuleContent(ctx) {
  const body = ctx.stripAgentsHeader(ctx.kernelContent).trim();
  return `---\ntype: always\n---\n\n${body}\n`;
}

module.exports = {
  adapterRegistry,
  getEnabledAdapters
};
