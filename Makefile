.PHONY: check release

RELEASE_ARGS :=
ifneq ($(strip $(VERSION)),)
RELEASE_ARGS += --version $(VERSION)
endif

check:
	node --test tools/release.test.mjs tools/update-agent-seed.test.mjs tools/git-code-tracker-release.test.mjs tools/managed-skill-updates.test.mjs

release: check
	node tools/release.mjs $(RELEASE_ARGS)
