const path = require("path");

module.exports = {
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "packages/sidekick-core/**/*.js",
        "packages/sidekick-cli/bin/**/*.js"
      ],
      exclude: [
        "**/node_modules/**",
        "**/tests/**"
      ],
      lines: 100,
      functions: 100,
      branches: 100,
      statements: 100
    }
  },
  resolve: {
    alias: {
      "@root": path.resolve(__dirname)
    }
  }
};
