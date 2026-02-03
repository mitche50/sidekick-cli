module.exports = {
  id: "adapter-id",
  requiresAgentsMd: true,
  isEnabled(config) {
    return Boolean(config.adapters?.adapterIdFlag);
  },
  preflight(ctx) {
    // Validate paths, managed files, and required directories.
  },
  write(ctx) {
    // Emit adapter outputs using ctx.agentsMdPath / ctx.agentsContent.
  }
};
