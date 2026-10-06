PNPM ?= pnpm

.PHONY: test package validate

# Fast local validation for repository invariants and plugin smoke checks.
test:
	$(PNPM) check:skill-submodules
	$(PNPM) check:skill-drift
	$(PNPM) check:no-content-duplicates
	$(PNPM) check:install-entrypoints
	$(PNPM) check:marketplace-assets
	$(PNPM) check:codex
	$(PNPM) check:codex-package
	$(PNPM) check:claude-desktop
	$(PNPM) -r typecheck
	$(PNPM) test:core

# Build/package release artifacts locally.
package:
	$(PNPM) --filter volcano build
	$(PNPM) package:vscode
	$(PNPM) package:claude-desktop

# Full local validation, including host-specific validators outside pnpm.
validate: test
	claude plugin validate plugins/claude-code
	claude plugin validate .claude-plugin/marketplace.json
	$(MAKE) package
