# NanoCalc — common tasks. Everything runs on Node; no other dependencies
# (validate-refs alone needs the Python packages in tests/validation/requirements.txt).
#   make                show this help
#   make serve          run the app at http://localhost:$(PORT)
#   make test           run the full test suite (incl. cross-validation vs SciPy/miepython references)
#   make lint           syntax, file references, debug leftovers, version consistency
#   make review         regenerate docs/REVIEW.md (expert sign-off sheet)
#   make check          lint + tests + up-to-date review sheet (CI runs this)
#   make validate-refs  regenerate tests/validation/reference.json with SciPy/miepython

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
.PHONY: help serve test lint review check validate-refs

help:
	@echo NanoCalc make targets:
	@echo   make serve          - run the app at http://localhost:$(PORT)  [PORT=nnnn to change]
	@echo   make test           - run the test suite, incl. cross-validation against SciPy/miepython
	@echo   make lint           - syntax, file references, debug leftovers, version consistency
	@echo   make review         - regenerate docs/REVIEW.md, the expert sign-off checklist
	@echo   make check          - lint, test, then fail if docs/REVIEW.md is out of date [CI]
	@echo   make validate-refs  - regenerate the SciPy/miepython reference values [needs Python]

serve:
	$(NODE) tools/serve.js $(PORT)

test:
	$(NODE) tests/run-tests.js

lint:
	$(NODE) tools/lint.js

review:
	$(NODE) tools/review-sheet.js

# Regenerates the review sheet and fails if that changed it, so a commit never
# carries formulas the review sheet does not list.
check: lint test review
	git diff --exit-code --stat -- docs/REVIEW.md

validate-refs:
	$(PYTHON) tests/validation/generate.py
