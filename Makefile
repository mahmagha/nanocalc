# NanoCalc — common tasks. Everything runs on Node; no other dependencies.
#   make            show this help
#   make serve      run the app at http://localhost:$(PORT)
#   make test       run the full test suite
#   make review     regenerate docs/REVIEW.md (expert sign-off sheet)
#   make check      tests + up-to-date review sheet (use before committing)

NODE ?= node
PORT ?= 8080

.DEFAULT_GOAL := help
.PHONY: help serve test review check

help:
	@echo NanoCalc make targets:
	@echo   make serve    - run the app at http://localhost:$(PORT)  [PORT=nnnn to change]
	@echo   make test     - run the test suite [all calculators, references, KaTeX]
	@echo   make review   - regenerate docs/REVIEW.md, the expert sign-off checklist
	@echo   make check    - test, then fail if docs/REVIEW.md is out of date

serve:
	$(NODE) tools/serve.js $(PORT)

test:
	$(NODE) tests/run-tests.js

review:
	$(NODE) tools/review-sheet.js

# Regenerates the review sheet and fails if that changed it, so a commit never
# carries formulas the review sheet does not list.
check: test review
	git diff --exit-code --stat -- docs/REVIEW.md
