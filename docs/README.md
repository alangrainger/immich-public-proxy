# Docs site

The user documentation at [docs.ipp.nz](https://docs.ipp.nz), built with [VitePress](https://vitepress.dev). This
file is the maintainer's guide to the site and is excluded from the build (`srcExclude` in `.vitepress/config.ts`).
Read it before adding or moving a page.

## Contents

- [Working on the site](#working-on-the-site)
- [Structure](#structure)
- [Where new content goes](#where-new-content-goes)
- [Page conventions](#page-conventions)
- [Config reference pages](#config-reference-pages)
- [The README](#the-readme)

## Working on the site

```bash
cd docs
npm install
npm run dev      # live preview
npm run build    # fails on dead links and config pages that disagree with config.json; run it before pushing
```

The navbar's star count is fetched from the GitHub API when the site builds (`fetchStars` in `.vitepress/config.ts`)
and rendered by the theme, so visitors' browsers never call GitHub. A local build with no network prints a warning
and omits the pill; nothing is wrong. The deploy workflow also rebuilds weekly so the number stays current.

The sidebar is hand-maintained in `.vitepress/config.ts`, so a new page is invisible until it is added there.
Static files (images, favicon) live in `public/` and are referenced by relative path, e.g. `./public/share-link.webp`,
which renders on GitHub as well; VitePress rewrites it to a hashed asset at build time.
`public/CNAME` holds the custom domain; it is copied to the root of the build and must stay there.

Publishing is automatic. Any push to `main` that touches `docs/` runs the `docs.yaml` workflow, which builds the
site and deploys it to GitHub Pages at [docs.ipp.nz](https://docs.ipp.nz). A dead link, or a config page that
disagrees with `config.json` ([Config reference pages](#config-reference-pages)), fails the build, so the workflow
fails and the live site stays on the previous version. Run `npm run build` yourself before pushing rather
than finding out from a red tick.

## Structure

The site follows the [Diátaxis](https://diataxis.fr) model: every page is one of tutorial, how-to guide, reference or
explanation, and a page never mixes kinds. Each sidebar group holds one kind and is named for the reader's question
rather than the Diátaxis term.

| Group           | Kind      | Reader's question                          | Rules |
|-----------------|-----------|--------------------------------------------|-------|
| Getting started | Tutorial  | What is this, and how do I get it running? | Ordered as a path: Introduction, Installation, Sharing from Immich, Upgrading. Numbered steps, one happy path, defaults only. Link to reference pages rather than explaining options inline. |
| Configuration   | Reference | What does this key do?                     | One page per `ipp.*` group, mirroring `app/config.json`. Every key has a `**Type:** … · **Default:** …` line and a short description; each page opens with a worked example. Complete and neutral: no advice, no tutorials. The Config generator, after the overview, is a tool built from these pages, not a page to add content to. |
| Guides          | How-to    | How do I achieve this goal?                | One goal per page and the title names the goal. Assume IPP is installed. Label every config block with the proxy or platform it is for; Caddy first, then others. |
| Troubleshooting | How-to    | Why is this happening?                     | One page, one `##` per problem. The heading is the symptom as the user sees it (a log line, or what they observe), then the cause, then the fix, then links to the GitHub issues. |

Explanation (how IPP works, the security model, design principles) lives in **Introduction**. It sits in Getting
started because it is what people read first, not because it is a tutorial. If explanation outgrows one page, add a
"Concepts" group rather than pushing "why" material into a guide or a reference page.

## Where new content goes

| You are adding…                                | Put it in |
|------------------------------------------------|-----------|
| A config key                                   | The page for its group, in `config.json` order, with type and default. Rename a key only in a major version, and add a row for it to Renamed config keys (`config/upgrading.md`). |
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
  links. Anchors are the heading text lowercased with backticks stripped and spaces and underscores as hyphens
  (`IPP_CONFIG` is `#ipp-config`); keep headings that
  are link targets free of other punctuation.
- Config keys are written as `` `gallery.showTitle` `` and linked to their section the first time they appear on a page.
- Callouts use GitHub syntax (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`) and are kept for things that bite.
- Code fences are tagged `yaml`, `json` or `bash`. Caddyfiles use a plain fence; there is no highlighter for them.
- Images are `<img src="./public/name.webp" width="…" height="…" alt="…">` with real dimensions so the page does not shift
  while loading.
- Types and defaults come from `app/config.json` and `upload-app/config.json`. The build checks them; see
  [Config reference pages](#config-reference-pages).
- British English, hyphens rather than dashes, and "IPP" after the first "Immich Public Proxy" on a page.

## Config reference pages

The pages in `config/` are the only description of the config keys. The Config generator (`config/generator.md`) is
built from them, and the build checks them against `app/config.json` and `upload-app/config.json`, both ways. A
disagreement fails `npm run build`, and `npm run dev` prints it as a warning. `npm test` at the repo root runs the same
check without building the site (`tests/configSchema.test.ts`). The check fails when:

- a key in either file is not documented, or is documented twice;
- a documented key is in neither file;
- a documented type or default differs from the file, or the allowed values leave out the default;
- a key in both files has a different default in each;
- a row of Renamed config keys (`config/upgrading.md`) names a current key that no page documents;
- a label in `LABELS` (see below) is for a key that no page documents.

The parsing and the checks are in `.vitepress/configSchema.ts`, which also runs in the browser for the generator;
reading the files and failing the build are in `.vitepress/configCheck.ts`. The generator itself is
`.vitepress/theme/components/ConfigGenerator.vue`, fed by the data loader next to it.

For the same reason the docs workflow also runs on a change to either `config.json`: a key or default changed on
`main` redeploys the site, and the deploy fails if the page was not updated in the same push.

The check reads only this format:

- **Prefix.** A reference page names its dotted prefix in frontmatter: `prefix: ipp.gallery`. Pages without one are
  not read, so a key documented on such a page counts as undocumented.
- **Key section.** A `##` or `###` heading that is one inline-code key, such as `` ## `showTitle` ``, whose first
  paragraph is the Type line. The key's path is the prefix plus the heading. A heading followed by anything else is
  prose: `## Example` and the upload page's `` ### `PUBLIC_BASE_URL` `` are skipped.
- **Type line.** `` **Type:** `bool` · **Default:** `false` ``, on its own. The type is `bool`, `int`, `string`,
  `object`, `` `bool` or `string` ``, or `various` (any JSON value), and the default is JSON. Leave the default out
  only on an object key: a group whose keys are documented on their own page (`gallery` on General options), or a
  free-form object such as `responseHeaders`, whose default is taken from `config.json`.
- **Description.** The paragraph after the Type line. The generator shows it beside the field, so it should make
  sense on its own. A `#anchor` link in it is pointed at the key's own page.
- **Allowed values.** A bullet list directly after the description whose every item starts with an inline-code JSON
  value: `` - `"original"` - the full-resolution original file ``. Any other list is prose. These become the
  generator's choices, so list every value IPP takes, aliases included (`true` for `groupByDate`).
- **Flag tables.** A section whose first paragraph starts ``Under `ipp.showMetadata.exif`.`` and that has a table
  with `Option`, `Type`, `Default` and `Description` columns documents one key per row, as on the Metadata page.

The generator has one section per reference page, in sidebar order and under the sidebar label, so a new reference
page needs its sidebar entry before its keys appear there. Its field labels are the key names as words (`showArrows`
is "Show arrows"). Where that reads badly or a number field needs its unit, `LABELS` in `.vitepress/configSchema.ts`
gives the label instead; a key name with an acronym in it goes in `ACRONYMS` there, so the label writes it in capitals. Renamed config keys feeds its paste box: a pasted old key
is shown with the Current key cell of its row, so keep that cell readable on its own.

## The README

`README.md` at the repo root is the front door, not a second copy of the site: pitch, demo, screenshot, quick start
and links. When something is worth documenting, it goes on the site and the README links to it.
