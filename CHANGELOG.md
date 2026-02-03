# Changelog

## 0.1.0-rc.1

- Initial release candidate of Sidekick CLI and core compiler.
- Module discovery via configurable `moduleDirs`.
- Deterministic logging wrapper with `sidekick run`.
- Adapter generation (AGENT.md/GEMINI.md, Aider, Gemini) with safe overwrite controls.
- Enforced kernel/index size budgets and lockfile generation.

## 0.1.0-rc.2

- Streamed output support in `sidekick run`.
- Opportunity-set heuristics using `triggers` and git file changes.
- Kernel template override support documented and loaded from package defaults.

## 0.1.0-rc.3

- Fixed glob trigger matching and added git-less fallback behavior in reports.
- Hardened `sidekick run` output parsing and exit codes; capped buffers.
- Improved adapter overwrite handling for copy fallback and CRLF normalization.
- Symlink escape protection for entrypoints and actionable index budget errors.

## 0.1.0-rc.4

- Enforced manifest name validation and safer adapter filename checks.
- Deterministic wrapper enforcement now fails on missing/invalid sources.
- Lockfile now uses project-relative dirs when possible.
- Added CLI smoke test in CI and improved trigger glob safety.

## 0.1.0-rc.5

- Fixed `sidekick run` enforcement exit codes and wrapper flag parsing.
- Added Windows shell support for wrapper execution.
- Hardened adapter preflight checks and gemini directory validation.
- Improved git detection for reports and ensured index output ends with newline.

## 0.1.0-rc.6

- Added streaming detection of `Sources consulted` to avoid tail-buffer misses.
- Added Windows CI smoke test coverage.

## 0.1.0-rc.7

- Removed unused plugins package.
- Added comprehensive CLI tests for positive and negative cases.
- Updated package metadata for publishing.

## 0.1.0-rc.8

- Anchored Sources consulted parsing and improved report output for empty opportunity sets.
- Switched to ASCII-safe sorting for deterministic outputs.
- Marked profiles as future implementation in the spec.

## 0.1.0-rc.9

- Added gitHead to lockfile when available.
- Switched CI tests to run init/add/build via the CLI.
- Documented Windows wrapper fallback and AGENTS.md adapter behavior.
- Set npm scope to `@mitche50`.

## 0.1.0-rc.10

- Added adapter type checks in CI tests.
- Clarified gitHead best-effort behavior and publishing order.
- Added monorepo workspace root package.json.

## 0.1.0-rc.11

- Added root package metadata and publish script.

## 0.1.0

- Finalized publishable 0.1.0 release.
- Added global install instructions for CLI.
- Added `sidekick promote` command for kernel rule promotion.
- Fixed gemini adapter preflight and promote budget enforcement.
- Hardened adapter symlink detection and added gemini idempotency CI test.
- Updated Gemini adapter settings format and CI install steps.
