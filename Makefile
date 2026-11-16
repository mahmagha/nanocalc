# NanoCalc — common tasks. Everything runs on Node; no other dependencies
# (validate-refs alone needs the Python packages in tests/validation/requirements.txt).
#   make                show this help
#   make serve          run the app at http://localhost:$(PORT)
#   make test           run the full test suite (incl. cross-validation vs SciPy/miepython references)
#   make lint           syntax, file references, debug leftovers, version consistency
#   make review         regenerate docs/REVIEW.md (expert sign-off sheet)
#   make check          lint + tests + up-to-date review sheet (CI runs this)
#   make validate-refs  regenerate tests/validation/reference.json with SciPy/miepython/pyGAPS
#   make verify-refs    verify every citation and library work against Crossref/Open Library [network]
#   make treatise       rebuild docs/REFERENCE-TREATISE.md from the library and verification report

NODE ?= node
PORT ?= 8080
# Python for validate-refs: the project-local venv if present, else python on PATH
ifeq ($(OS),Windows_NT)
  VENV_PY := .venv/Scripts/python.exe
else
  VENV_PY := .venv/bin/python
endif
PYTHON ?= $(if $(wildcard $(VENV_PY)),$(VENV_PY),python)

.DEFAULT_GOAL := help
.PHONY: help serve test lint review check validate-refs verify-refs treatise build e2e

help:
	@echo NanoCalc make targets:
	@echo   make serve          - run the app at http://localhost:$(PORT)  [PORT=nnnn to change]
	@echo   make test           - run the test suite, incl. cross-validation against SciPy/miepython
	@echo   make lint           - syntax, file references, debug leftovers, version consistency
	@echo   make review         - regenerate docs/REVIEW.md, the expert sign-off checklist
	@echo   make check          - lint, test, then fail if docs/REVIEW.md is out of date [CI]
	@echo   make validate-refs  - regenerate the SciPy/miepython/pyGAPS reference values [needs Python]
	@echo   make verify-refs    - verify all references against Crossref/Open Library [needs network]
	@echo   make treatise       - rebuild docs/REFERENCE-TREATISE.md
	@echo   make build          - build the deployed site into _site [one script and one stylesheet bundle]
	@echo   make e2e            - browser tests of _site with Playwright [needs: npm install --no-save @playwright/test]

serve:
	$(NODE) tools/serve.js $(PORT)

test:
	$(NODE) tests/run-tests.js

lint:
	$(NODE) tools/lint.js

build:
	$(NODE) tools/build.js _site

e2e: build
	npx playwright test -c tests/e2e

review:
	$(NODE) tools/review-sheet.js

# Regenerates the review sheet and the treatise and fails if either changed, so a commit
# never carries formulas or references the documents do not list.
check: lint test review treatise
	git diff --exit-code --stat -- docs/REVIEW.md docs/REFERENCE-TREATISE.md

validate-refs:
	$(PYTHON) tests/validation/generate.py

verify-refs:
	$(NODE) tools/verify-refs.js

treatise:
	$(NODE) tools/build-treatise.js
