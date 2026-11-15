# KaTeX 0.16.11 (vendored)

A local copy of [KaTeX](https://katex.org) 0.16.11, so NanoCalc typesets equations offline without a CDN.

- **Source:** `katex.min.js`, `katex.min.css` and the `.woff2` fonts from the `dist/` folder of the official npm package `katex@0.16.11` (also served by cdnjs).
- **Verified:**
  - the npm tarball matched the registry's `dist.integrity` hash;
  - every file here is byte-identical to the npm `dist/` copy;
  - the JS and CSS also match cdnjs's published SRI hashes.
- **Integrity:** `SRI.json` lists the SHA-512 hash of every file, and `node tests/run-tests.js` checks them.
- **Fonts:** only `.woff2` is included, since every current browser supports it. The `.woff`/`.ttf` fallbacks named in the CSS are never requested.
- **License:** MIT, see `LICENSE`.

To upgrade, replace this folder with a newer `dist/`, regenerate `SRI.json`, and update the paths in `index.html`.
