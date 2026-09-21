# Docs site

The user documentation at [docs.ipp.nz](https://docs.ipp.nz), built with [VitePress](https://vitepress.dev). This
file is the maintainer's guide to the site and is excluded from the build (`srcExclude` in `.vitepress/config.ts`).
Read it before adding or moving a page.

## Contents

- [Working on the site](#working-on-the-site)
- [Structure](#structure)
- [Where new content goes](#where-new-content-goes)
- [Page conventions](#page-conventions)
- [The README](#the-readme)

## Working on the site

```bash
cd docs
npm install
npm run dev      # live preview
npm run build    # fails on dead internal links; run it before pushing
```

The sidebar is hand-maintained in `.vitepress/config.ts`, so a new page is invisible until it is added there.
Static files (images, favicon) live in `public/` and are referenced by absolute path, e.g. `/share-link.webp`.
`public/CNAME` holds the custom domain; it is copied to the root of the build and must stay there.

Publishing is automatic. Any push to `main` that touches `docs/` runs the `docs.yaml` workflow, which builds the
site and deploys it to GitHub Pages at [docs.ipp.nz](https://docs.ipp.nz). A dead link fails the build, so the
workflow fails and the live site stays on the previous version. Run `npm run build` yourself before pushing rather
than finding out from a red tick.

## Structure

The site follows the [Diátaxis](https://diataxis.fr) model: every page is one of tutorial, how-to guide, reference or
explanation, and a page never mixes kinds. Each sidebar group holds one kind and is named for the reader's question
rather than the Diátaxis term.

| Group           | Kind      | Reader's question                          | Rules |
|-----------------|-----------|--------------------------------------------|-------|
| Getting started | Tutorial  | What is this, and how do I get it running? | Ordered as a path: Introduction, Installation, Sharing from Immich, Upgrading. Numbered steps, one happy path, defaults only. Link to reference pages rather than explaining options inline. |
| Configuration   | Reference | What does this key do?                     | One page per `ipp.*` group, mirroring `app/config.json`. Every key has a `**Type:** … · **Default:** …` line and a short description; each page opens with a worked example. Complete and neutral: no advice, no tutorials. |
| Guides          | How-to    | How do I achieve this goal?                | One goal per page and the title names the goal. Assume IPP is installed. Label every config block with the proxy or platform it is for; Caddy first, then others. |
| Troubleshooting | How-to    | Why is this happening?                     | One page, one `##` per problem. The heading is the symptom as the user sees it (a log line, or what they observe), then the cause, then the fix, then links to the GitHub issues. |

Explanation (how IPP works, the security model, design principles) lives in **Introduction**. It sits in Getting
started because it is what people read first, not because it is a tutorial. If explanation outgrows one page, add a
"Concepts" group rather than pushing "why" material into a guide or a reference page.

## Where new content goes

| You are adding…                                | Put it in |
|------------------------------------------------|-----------|
| A config key                                   | The page for its group, in `config.json` order, with type and default. If you renamed a key, add a row to Legacy config keys and a shim in `app/src/config/migrations.ts`. |
| An environment variable                        | `config/environment-variables.md` |
| Something visitors to a share will notice      | `how-to-use.md` (Sharing from Immich) |
| A reverse-proxy or hosting recipe              | A new page under Guides |
| The fix for a recurring support question       | `troubleshooting.md`, symptom first |
| A design decision or a "why"                   | `introduction.md` |
| Developer or contributor information           | `CONTRIBUTING.md` at the repo root, not the site |

## Page conventions

- The H1 is the sidebar label. The first paragraph says what the page covers.
- Paths are public URLs, linked from GitHub issues and forums: do not rename or move a published page. Change the
  sidebar label and H1 instead. That is why "General options" is served from `/config/ipp-options` and "Sharing from
  Immich" from `/how-to-use`.
- Internal links are absolute site paths with optional anchors (`/config/gallery#showtitle`), never relative file
  links. Anchors are the heading text lowercased with backticks stripped and spaces as hyphens; keep headings that
  are link targets free of other punctuation.
- Config keys are written as `` `gallery.showTitle` `` and linked to their section the first time they appear on a page.
- Callouts use GitHub syntax (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`) and are kept for things that bite.
- Code fences are tagged `yaml`, `json` or `bash`. Caddyfiles use a plain fence; there is no highlighter for them.
- Images are `<img src="/name.webp" width="…" height="…" alt="…">` with real dimensions so the page does not shift
  while loading.
- Types and defaults come from `app/config.json` and the code. Check, don't guess.
- British English, hyphens rather than dashes, and "IPP" after the first "Immich Public Proxy" on a page.

## The README

`README.md` at the repo root is the front door, not a second copy of the site: pitch, demo, screenshot, quick start
and links. When something is worth documenting, it goes on the site and the README links to it.
