# Quizzivy API contract hub -- developer entry points (README.md).

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Generator versions are PINNED. A floating version makes the drift check
# meaningless: regenerated output would differ for reasons unrelated to the
# contract.
SPECTRAL_VERSION ?= 6.16.3
OPENAPI_TS_VERSION ?= 7.13.0
# The breaking-change checker (D-080), run with `go run` so no Go module is
# needed here.
OASDIFF_VERSION ?= v1.33.0

.PHONY: help install contract test gen gen-check sdk-check check

help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install the tools the tests use
	pnpm install --frozen-lockfile

contract: ## Lint api/openapi.yaml and assert its invariants
	npx --yes @stoplight/spectral-cli@$(SPECTRAL_VERSION) lint api/openapi.yaml --ruleset api/.spectral.yaml
	pnpm vitest run tests/contract
	pnpm tsc --noEmit

test: ## The contract tests and the SDK scripts' own tests
	pnpm vitest run
	node --test "scripts/sdk/tests/*.test.mjs"

gen: contract ## Regenerate the package (sdk/) from api/
	node scripts/sdk/gen.mjs api sdk
	npx --yes openapi-typescript@$(OPENAPI_TS_VERSION) api/openapi.yaml -o sdk/schema.d.ts
	@echo "generated: sdk/"

gen-check: gen ## Fail if sdk/ drifts from api/ (what CI runs)
	@git diff --exit-code -- sdk \
		|| (echo ""; \
		    echo "Generated code is out of date. Run 'make gen' and commit the result."; \
		    exit 1)
	@untracked=$$(git ls-files --others --exclude-standard -- sdk); \
		[ -z "$$untracked" ] || { echo "Generated files not committed: $$untracked"; exit 1; }
	@echo "sdk/ matches api/"

sdk-check: ## Report breaking contract changes since the merge-base with SDK_BASE (default origin/develop)
	OASDIFF="go run github.com/oasdiff/oasdiff@$(OASDIFF_VERSION)" node scripts/sdk/check.mjs

check: gen-check test sdk-check ## Everything CI runs
