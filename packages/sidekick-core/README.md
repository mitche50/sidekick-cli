# @mitche50/sidekick-core

The compiler engine behind Sidekick. This package does the heavy lifting -- you probably want the CLI instead.

## What it does

- Resolves modules from your configured search paths
- Compiles `AGENTS.md` and `.sidekick/index.min.txt`
- Writes lockfiles and enforces context budgets
- Emits adapter files and telemetry helpers

## Usage

Most users should install the CLI:

```bash
npm install -g @mitche50/sidekick-cli
```

If you're building tooling on top of Sidekick, you can use the core directly:

```js
const sidekick = require("@mitche50/sidekick-core");
```
