# tm-site

`apps/tm-site/src` is the source-owned site tree for GitHub Pages content.

Published files still live in the repo root because the current Pages flow expects
them there. Use `python scripts/sync_tm_site.py` to sync source-owned landing,
guide, and asset files back to the publish target.

Generated tierlist pages are source-owned under `apps/tm-site/src/output` and are
mirrored to the current publish target `output/` by the tierlist generator.

Scope of this module:
- landing page
- guide pages
- source-owned generated tierlist HTML under `src/output`
- site assets (`favicon*`, `og-image.png`)

Out of scope:
- `extension/**`
- `bot/**`
- `scripts/tm_advisor/**`
- runtime logs and temporary analysis artifacts
