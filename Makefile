# SA Academy — monorepo task runner
# Default target: help

SHELL := /bin/sh

PIPELINE_DIR := pipeline
CLIENT_DIR   := client
PACK_DIR     := content-pack

PACK_PORT   ?= 8173
PACK_BASE   ?= https://raw.githubusercontent.com/sandroconte/sa-academy/master/content-pack
LAN_IP      := $(shell ipconfig getifaddr en0 2>/dev/null)
DATE_UTC    := $(shell date -u +%FT%TZ)

.DEFAULT_GOAL := help
.PHONY: help install pack build build-pipeline build-web test test-pipeline test-client \
        verify typecheck run-web run-ios run-android device release-android serve-pack \
        deploy-web publish-pack clean distclean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --------------------------------------------------------------- setup -------

install: ## Install dependencies (pipeline + client)
	cd $(PIPELINE_DIR) && npm install
	cd $(CLIENT_DIR) && npm install

# ------------------------------------------------------------ pipeline -------

pack: ## Build the content pack locally (clones source repos, needs network)
	cd $(PIPELINE_DIR) && npm run pipeline
	@echo "Pack written to ./$(PACK_DIR)"

serve-pack: ## Serve ./content-pack on http://localhost:$(PACK_PORT)
	cd $(PACK_DIR) 2>/dev/null || exit 1; \
	python3 -m http.server $(PACK_PORT)

# ---------------------------------------------------------------- build ------

build: build-pipeline build-web ## Build everything (pipeline tsc + web bundle)

build-pipeline: ## Compile pipeline TypeScript
	cd $(PIPELINE_DIR) && npm run build

build-web: ## Production web bundle -> client/dist (bakes PACK_BASE)
	cd $(CLIENT_DIR) && EXPO_PUBLIC_PACK_BASE=$(PACK_BASE) npx expo export --platform web
	@echo "Bundle in $(CLIENT_DIR)/dist/"

# ----------------------------------------------------------------- test ------

test: test-pipeline test-client ## Run all unit suites

test-pipeline: ## Pipeline vitest suite
	cd $(PIPELINE_DIR) && npm test

test-client: ## Client unit suite (pure logic)
	cd $(CLIENT_DIR) && npm test

typecheck: ## TypeScript check (client strict gate)
	cd $(CLIENT_DIR) && npx tsc --noEmit

verify: typecheck test ## Typecheck + all tests (pre-merge gate)

# ------------------------------------------------------------------ run ------

run-web: ## Expo dev server for browser (expects `make pack` + `make serve-pack`)
	cd $(CLIENT_DIR) && EXPO_PUBLIC_PACK_BASE=http://localhost:$(PACK_PORT) npx expo start --web

run-ios: ## iOS simulator (localhost reachable as-is)
	cd $(CLIENT_DIR) && EXPO_PUBLIC_PACK_BASE=http://localhost:$(PACK_PORT) npx expo start
	@echo "Press i to launch the simulator"

run-android: ## Android emulator (host alias 10.0.2.2)
	cd $(CLIENT_DIR) && EXPO_PUBLIC_PACK_BASE=http://10.0.2.2:$(PACK_PORT) npx expo start
	@echo "Press a to launch the emulator"

device: ## Physical device via Expo Go (uses LAN IP; same Wi-Fi required)
	@if [ -z "$(LAN_IP)" ]; then echo "No LAN IP found on en0 — set it manually."; exit 1; fi
	cd $(CLIENT_DIR) && EXPO_PUBLIC_PACK_BASE=http://$(LAN_IP):$(PACK_PORT) npx expo start
	@echo "Scan the QR with Expo Go — pack base: http://$(LAN_IP):$(PACK_PORT)"

# Standalone APK install on a connected device (no Expo Go / dev server).
# Builds the native project once, then installs via adb.
# ANDROID_VARIANT defaults to debug (no signing); set release to build a signed release.
ANDROID_VARIANT ?= debug
export ANDROID_HOME := $(shell for p in "$(ANDROID_HOME)" "$$HOME/Library/Android/sdk" "$$HOME/Android/Sdk" "$$HOME/android-sdk"; do [ -d "$$p" ] && { echo "$$p"; break; }; done)
ifeq ($(ANDROID_VARIANT),release)
ANDROID_TASK := assembleRelease
else
ANDROID_TASK := assembleDebug
endif
ANDROID_APK_DIR  := $(CLIENT_DIR)/android/app/build/outputs/apk/$(ANDROID_VARIANT)
ANDROID_APK      := $(ANDROID_APK_DIR)/app-$(ANDROID_VARIANT).apk

release-android: ## Build standalone APK and install on a connected Android device (no Expo)
	@command -v adb >/dev/null 2>&1 || { echo "adb not found in PATH"; exit 1; }
	@if [ -z "$(ANDROID_HOME)" ]; then echo "Android SDK not found — set ANDROID_HOME"; exit 1; fi
	cd $(CLIENT_DIR) && EXPO_PUBLIC_PACK_BASE=$(PACK_BASE) npx expo prebuild --platform android --clean
	@test -f $(CLIENT_DIR)/android/local.properties || echo "sdk.dir=$(ANDROID_HOME)" > $(CLIENT_DIR)/android/local.properties
	cd $(CLIENT_DIR)/android && ./gradlew $(ANDROID_TASK) && \
	adb install -r $(ANDROID_APK)
	@echo "Installed $(ANDROID_APK) on connected device"

# ---------------------------------------------------------------- deploy -----

deploy-web: build-web ## Publish web bundle to the gh-pages branch
	@if [ ! -d "$(CLIENT_DIR)/dist" ]; then echo "Build failed"; exit 1; fi
	cd $(CLIENT_DIR)/dist && \
	rm -rf .git && \
	git init -q && \
	git checkout -q -b gh-pages && \
	git add -A && \
	git commit -q -m "deploy: web bundle $(DATE_UTC)" && \
	git remote add origin $$(git -C ../../.. remote get-url origin) && \
	git push -q -f origin gh-pages && \
	echo "Published to gh-pages ($(DATE_UTC))"

publish-pack: ## Commit+push regenerated pack to master (normally done by CI)
	@test -d "$(PACK_DIR)" || { echo "Run 'make pack' first"; exit 1; }
	git add $(PACK_DIR)
	@if git diff --cached --quiet; then echo "Pack unchanged"; else \
		git commit -m "chore(content-pack): rebuild [skip ci]" && git push origin master; fi

# ---------------------------------------------------------------- clean ------

clean: ## Remove build artifacts (keeps node_modules)
	rm -rf $(PIPELINE_DIR)/dist $(PIPELINE_DIR)/.sources $(CLIENT_DIR)/dist

distclean: clean ## Also remove node_modules (full reset)
	rm -rf $(PIPELINE_DIR)/node_modules $(CLIENT_DIR)/node_modules
