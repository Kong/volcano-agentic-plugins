# Changelog

## [0.2.3](https://github.com/Kong/volcano-agentic-plugins/compare/v0.2.2...v0.2.3) (2026-07-24)


### Bug Fixes

* **install-volcano:** plugin-first wiring, no stale ~/.volcano fallback alongside a plugin ([#40](https://github.com/Kong/volcano-agentic-plugins/issues/40)) ([6da9382](https://github.com/Kong/volcano-agentic-plugins/commit/6da9382eb679391fa49bb924a1f202e529eadc3f))

## [0.2.2](https://github.com/Kong/volcano-agentic-plugins/compare/v0.2.1...v0.2.2) (2026-07-24)


### Bug Fixes

* **release:** skip upstream skill-pin freshness check when building from tag ([#37](https://github.com/Kong/volcano-agentic-plugins/issues/37)) ([093c0d3](https://github.com/Kong/volcano-agentic-plugins/commit/093c0d3ffe5f49f117e6702aa6e2c3ee45c4fa1c))

## [0.2.1](https://github.com/Kong/volcano-agentic-plugins/compare/v0.2.0...v0.2.1) (2026-07-24)


### Bug Fixes

* **skills:** sync volcano-skills submodule to f09bf5e ([#38](https://github.com/Kong/volcano-agentic-plugins/issues/38)) ([1e3dafc](https://github.com/Kong/volcano-agentic-plugins/commit/1e3dafcfe01cf1a37c8a6825aa9f866673bc167b))

## [0.2.0](https://github.com/Kong/volcano-agentic-plugins/compare/v0.1.0...v0.2.0) (2026-07-24)


### Features

* **ci:** auto-merge skill-sync PRs instead of asking a maintainer to merge ([#33](https://github.com/Kong/volcano-agentic-plugins/issues/33)) ([dd9015c](https://github.com/Kong/volcano-agentic-plugins/commit/dd9015cce6086e2666a9958b4f82027452f2faee))


### Bug Fixes

* **bootstrap:** plugin-first wiring, no stale ~/.volcano fallback alongside a plugin ([#34](https://github.com/Kong/volcano-agentic-plugins/issues/34)) ([3ce5a03](https://github.com/Kong/volcano-agentic-plugins/commit/3ce5a03bff25fe84c8f4dd0ceba938abac9b5081))
* **e2e-agent-eval:** load plugin via --plugin-dir, exclude user settings scope ([#35](https://github.com/Kong/volcano-agentic-plugins/issues/35)) ([2f80335](https://github.com/Kong/volcano-agentic-plugins/commit/2f8033589cd4ace5e953ad6094e351c9038f40d7))
* **skills:** sync volcano-skills submodule to 2891dcd ([#31](https://github.com/Kong/volcano-agentic-plugins/issues/31)) ([add72dd](https://github.com/Kong/volcano-agentic-plugins/commit/add72dd621808adfaa0480e165327c128ca53df9))

## [0.1.0](https://github.com/Kong/volcano-agentic-plugins/compare/v0.0.4...v0.1.0) (2026-07-24)


### Features

* **cursor:** local plugin install as the manual path ([#3](https://github.com/Kong/volcano-agentic-plugins/issues/3)) ([df79f1f](https://github.com/Kong/volcano-agentic-plugins/commit/df79f1fc390e78172eb5a1ba7ed5f87b71deb19e))
* **scripts:** add bootstrap.sh, standalone manual-install path ([#7](https://github.com/Kong/volcano-agentic-plugins/issues/7)) ([c930d08](https://github.com/Kong/volcano-agentic-plugins/commit/c930d082366d2ed1f43e46012cf51d7e8ad46554))


### Bug Fixes

* **agents:** auto local run/deploy/test by default, with clean next-step suggestions ([#5](https://github.com/Kong/volcano-agentic-plugins/issues/5)) ([64cb538](https://github.com/Kong/volcano-agentic-plugins/commit/64cb538747623c7fb29879f537dc5f921c9ebb51))
* **ci:** skip skill-submodule staleness check in merge_group ([#15](https://github.com/Kong/volcano-agentic-plugins/issues/15)) ([0e23246](https://github.com/Kong/volcano-agentic-plugins/commit/0e23246446e3205e716ce0278b751ca81aa407a1))
* **ci:** split install-volcano entrypoint contract (agnostic skills, npm-default command wrappers) ([#22](https://github.com/Kong/volcano-agentic-plugins/issues/22)) ([edb1ded](https://github.com/Kong/volcano-agentic-plugins/commit/edb1ded7e0cdd2a5a40bd0eebc6e5d0246b9c0b3))
* **sync:** exclude .github from materialized plugin skill copies ([#17](https://github.com/Kong/volcano-agentic-plugins/issues/17)) ([3ad2fe8](https://github.com/Kong/volcano-agentic-plugins/commit/3ad2fe8886956fb3db583c8a0aa337897f5ce56f))
