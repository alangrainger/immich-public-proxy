# Contributing to Immich Public Proxy

Thanks for your interest in contributing. This guide covers what the project is, what it deliberately is not, and how to work on it productively. It is written for both human contributors and LLM coding agents - please read it end to end before opening a PR or making suggestions.

## Project philosophy and hard constraints

Immich Public Proxy (IPP) exists to share Immich photos publicly without exposing the Immich instance itself. Everything about the design follows from that single goal.

**Optimize for auditability.** Because IPP proxies a private photo library, the code stays small enough to audit for security-relevant behavior. New features that meaningfully grow the *attack surface* need a strong justification, even if they're functionally useful. "Lean" here is a security property, not a line-count target - features that add purely client-side UI complexity (a sidebar, a date-grouped view) don't trip this constraint; features that add new ways the server can talk to Immich, accept input, or persist state do.

**Read-only access to Immich. This is non-negotiable.** IPP must never modify Immich, its data, or its files. It does not use an Immich API key. The only Immich endpoints it calls are the ones reachable via a public share key. This rule rules out a large class of feature requests; see "What will not be accepted" below.

**The one write path lives in its own image.** Visitor uploads are the single exception, and they live in `upload-app/` (the `immich-public-proxy-upload` image), which operators add only if they want it. The upload service writes with the visitor's share key, so Immich enforces the share's "Allow public user to upload" toggle; it still has no API key and no state, and its only Immich write is `POST /assets` in `upload-app/src/forward.ts`. `app/` and `@ipp/core` stay read-only: no code that accepts a file or writes to Immich goes there.

**Stateless.** No database, no user accounts, no long-lived secrets beyond an encrypted cookie session for share passwords. Avoid adding persistent state. If you think you need a cache, estimate the real cost of not having it first.

**Privacy at the boundary.** Any invalid, expired, or upstream-failed request returns 404. Do not leak upstream Immich status codes, error bodies, or share existence to the client.

## Architecture at a glance

Request flow for a typical share URL like `https://proxy.example.com/share/<key>`:

1. Express routes in `app/src/index.ts` receive the request.
2. `app/src/immich.ts` fetches the share metadata from Immich over the local network (through `fetchSharedLink` in `@ipp/core`), validates it, and returns the asset list.
3. For a gallery, `app/src/gallery/builder.ts` builds the view-model and `app/src/view/gallery.tsx` renders it server-side with Preact. The page embeds a JSON init block consumed by the client.
4. The client gallery lives in `app/src/client/` (TypeScript ES modules, compiled file-for-file by `tsc` into `app/public/js/`). It wires PhotoSwipe v5 with a virtualized justified-rows layout. There is no client-side framework hydration.
5. For individual assets (image, video, thumbnail, download, zip), Express streams bytes from Immich back to the client without touching disk via `app/src/stream/`.

### Repository layout

The repo is an npm workspace with three packages: `shared/` is `@ipp/core`, the read-side code both apps share; `app/` is IPP itself; and `upload-app/` is the optional upload service, the only code that writes to Immich. Run `npm install` at the root; there is one lockfile.

```
.github/workflows/        ci.yaml builds and pushes both Docker images on v* tags; docs.yaml deploys the docs site
package.json              Workspace root: scripts that delegate to the workspaces; no dependencies
package-lock.json         The one lockfile for every workspace
.eslintrc                 Lint config for every workspace
shared/                   @ipp/core - read-side only, knows nothing about galleries
  src/
    index.ts              Barrel: everything the apps import comes from '@ipp/core'
    types.ts              Share-level types (SharedLink, Asset, KeyType, ...)
    immich/client.ts      Immich API request helper, URL building, key/id checks, version guard
    immich/share.ts       fetchSharedLink, password login + token cache, auth headers, title, slug-link gate
    config/loader.ts      loadConfig() reads env / file; the app passes its default path
    config/access.ts      getConfigOption() reads the loaded config
    http.ts               Operator-configured and no-store response headers, abortOnClose, asyncHandler, CORE_PUBLIC_DIR
    invalidRequest.ts     The 404 policy (never cached), errorHandler, and setInvalidRequestHandler for the app's own handler file
    session.ts            Cookie session, decodeCookie, unlock handler, invalid-password response
    encrypt.ts            Cookie-session encryption for password-protected shares
    version.ts            App version from APP_VERSION or the app's package.json
    utils/                log, sanitize (filenames), text (escaping), ttlLruCache, webStream (incl. streaming request bodies)
    view/                 Page renderer, theme script, password page
  public/                 Static assets both apps serve: pico, Inter font, favicon, theme.css (tokens, page base, page header)
  tests/                  Vitest unit tests for core
app/
  config.json             Runtime configuration, overrideable via volume or inline
  package.json            IPP's manifest; its version is the release version
  tsconfig.json           Server TypeScript config (compiles src/ to dist/; references shared/)
  tsconfig.client.json    Client TypeScript config (compiles src/client/ + src/shared/ to public/js/)
  vitest.config.ts        Unit-test runner config; aliases @ipp/core to its source
  src/
    index.ts              Express setup and routes
    immich.ts             Share lookup with album enumeration and cache, asset detail, IPP URLs
    invalidRequestHandler.ts  IPP's 404 handler; operators may replace the compiled file by a mount
    share.ts              Share-level policy (canDownload, expiry date, motion photos, upload link and probe)
    types.ts              Gallery-only server types
    version.ts            Release version and the static-asset cache-busting segment
    gallery/
      builder.ts          Gallery view-model construction
      exif.ts             EXIF / location whitelisting for the sidebar
      filename.ts         Download filename derivation
    stream/
      asset.ts            Single-asset stream (image / video / thumbnail)
      download.ts         Zip pipeline (concurrency-bounded, retry, abort)
    view/                 Gallery and home page Preact SSR templates (.tsx)
    shared/types.ts       Types shared between server SSR and client (GalleryItem, etc.)
    client/               Client gallery, virtualisation, lightbox, sidebar
  public/                 Static assets served as-is
    photoswipe/           Vendored PhotoSwipe v5
    thumbhash/, images/
    style.css, photoswipe-overrides.css
  tests/                  Vitest unit tests for IPP
upload-app/               immich-public-proxy-upload - one page per share; streams visitor files to Immich's POST /assets
  config.json             Default ipp.upload.* options; no responseHeaders
  src/
    index.ts              Express setup and routes, served both under /upload and at the root
    config.ts             Env and ipp.upload.* readers
    share.ts              Share lookup through core, cached 60 s
    gate.ts               The upload permit: the share's Immich toggle and the slug-link gate
    receive.ts            Validates one upload request: rate limit, length, filename, type, byte budget
    forward.ts            The only Immich write call: multipart POST /assets under the share key
    limits.ts             Fixed-window budgets for the rate limit and the byte budget
    filename.ts           Stored filename: sanitised, prefixed, extension kept
    notify.ts             Optional JSON webhook per stored file
    idleTimeoutStream.ts  Drops a request body that stalls
    view/upload.tsx       The upload page, in the look of Immich's upload UI
    client/upload.ts      The page client: queue, XHR uploads with retry, the upload panel
    shared/               Rules, types and icons shared by the server and the page client
  tests/                  Vitest unit tests for the upload app
docs/                     User docs site (VitePress); docs/README.md explains its structure
Dockerfile                Multi-stage build; IPP runs from /app as the non-root `node` user
Dockerfile.upload         The same for the upload service; it also runs from /app
docker-compose.yml        Reference deployment
```

**What goes in `@ipp/core`.** A module belongs in core when it is about Immich shares, HTTP plumbing, config, sessions, utilities or page rendering, and does not know what a gallery is. Core is read-side only: its one POST to Immich is the shared-link password login. The browser client shares no code with core; `app/src/shared/` is the separate server-and-client type folder.

The server tsconfig excludes `src/client/`; the client tsconfig only includes `src/client/` and `src/shared/`. Compiled client output (`app/public/js/`) is gitignored.

## Tech stack

- **Node.js** (LTS, per the `node:lts-alpine` base image).
- **TypeScript** with `strictNullChecks` enabled.
  - Server: target ES6, module CommonJS (`tsconfig.json`).
  - Client: target ES2022, module ESNext, browser libs (`tsconfig.client.json`). Compiled file-for-file by `tsc`; no bundler.
- **Express 4** for HTTP.
- **Preact** with `preact-render-to-string` for SSR-only templates. No client-side Preact.
- **PhotoSwipe v5** for the lightbox (vendored under `app/public/photoswipe/`).
- **thumbhash** for low-res placeholders (vendored).
- **archiver** for streaming "download all" zips.
- **cookie-session** for password-protected share sessions.
- **tsx** for running the server in dev with watch + ESM-native imports.
- **concurrently** to run the server and client tsc watchers side-by-side in dev.
- **vitest** for unit tests on pure functions.
- **ESLint** with `eslint-config-standard`.

## Development setup

```bash
npm install             # at the repo root, for every workspace
npm run dev             # builds @ipp/core once, then watches core, server and client
```

Required environment variables (set in `app/.env` or your shell):

- `IMMICH_URL` - local URL to your Immich instance. Should not be public.
- `PUBLIC_BASE_URL` - optional. Public base URL for IPP without trailing slash. Omit to derive from request hostname.
- `IPP_PORT` - optional. Default 3000.
- `IPP_CONFIG` - optional. Path to a config file. All variables: `docs/config/environment-variables.md`.

To exercise the full gallery flow you need a real Immich instance you can hit, with at least one public share created. The docs site has the user-facing setup steps (`docs/installation.md`).

Configuration overrides go in `app/config.json` or inline via env (see `docs/config/index.md`). Always read config through `getConfigOption('ipp.path.to.key', defaultValue)` rather than reading the JSON directly.

## Build, lint, test

At the repo root:

```bash
npm run build           # core, then IPP's server and client; output to dist/ and app/public/js/
npm test                # vitest run in every workspace (unit tests on pure functions)
npm run lint            # ESLint over every workspace
npm run bump -- 4.0.1   # set the version in every workspace manifest and the lockfile
```

In `app/`:

```bash
npm run build:server    # core and IPP's server only
npm run build:client    # client only
npm run test:watch      # vitest in watch mode
npm run test:container  # build a podman image and run it locally
```

`npm test` runs the pure-function unit tests in `shared/tests/`, `app/tests/` and `upload-app/tests/`. The apps' tests import `@ipp/core` from its source, so they need no build. Add tests as you touch a pure-function area, and for any new pure logic you introduce. Skip HTTP plumbing.

Beyond unit tests, exercise the gallery end-to-end against a real Immich instance: happy path plus failure paths (expired share, trashed asset, password protection, very large albums, video range requests).

## Conventions for adding code

**Configuration.** New options go in `app/config.json` under the appropriate `ipp.*` namespace, read via `getConfigOption`, and documented on the page for their group under `docs/config/` (see `docs/README.md` for the conventions). Prefer a group toggle plus per-field overrides over a single flat boolean when several related toggles cluster, following the `ipp.showMetadata` pattern. Rename a key only in a major version: the old name simply stops being read (no compatibility shim), and the rename gets a row in Renamed config keys (`docs/config/upgrading.md`) plus a line in that release's upgrade notes.

**Privacy of responses.** Always return 404 for invalid or upstream-failed requests. Use `respondToInvalidRequest` from `@ipp/core` rather than crafting ad-hoc error responses; it calls IPP's `invalidRequestHandler`, which index.ts registers at startup. Do not surface Immich status codes or error bodies to the client.

**Escaping.** Any string that originates from Immich and is embedded into HTML by the SSR templates must be escaped (use `escapeHtml` from `@ipp/core`). Strings that cross to the client via the init JSON block stay as plain text and are rendered with `textContent`, not `innerHTML` - that retired the "pre-escaped HTML over the wire" contract that the early gallery shipped with.

**Third-party links.** Any anchor the client renders that points to a third-party origin (the "Open in OpenStreetMap" link is the current example) must set `rel="noopener noreferrer"`. The `noreferrer` part is the load-bearing one: without it, the browser sends the share URL as the `Referer` header, and the share URL *is* the capability token for the album - it ends up in the third party's webserver logs. `noopener` prevents the new tab from touching `window.opener`. Embedding a third-party widget (map tile, oEmbed, etc.) instead of a click-through link reintroduces the same leak silently on every render - that's a design decision that needs more than a code change.

**PhotoSwipe UI.** Custom toolbar buttons, captions, and panels are registered through `lightbox.pswp.ui.registerElement`. The back button, download, fullscreen, and caption registrations live in `app/src/client/lightbox-ui.ts`; the info sidebar (a substantial UI element) lives in `app/src/client/sidebar.ts`. New small registrations join `lightbox-ui.ts`; anything panel-sized gets its own file.

**Streaming.** Assets are streamed from Immich to the client without buffering to disk. Keep it that way. The `archiver` zip flow is also fully streamed (with per-asset retry, an idle-timeout transform, and abort-on-failure semantics).

**File organisation.** Group functions by cohesion, not by file count. A file deserves its own name when it carries a coherent concept worth a separate filename - "filename sanitization" or "config loader" pass; "narrow unknown to string" does not. When several small helpers share a theme, group them in one file (`utils/text.ts` for escaping + narrowing; `share.ts` for share-level info + policy). When a single concern is substantial enough to dominate a file on its own, give it its own name (`stream/download.ts`). IPP optimises for audit reading rather than tree-shakeable reuse, so fewer cohesive files beat many one-export micro-modules. Same lens applies on the client (`app/src/client/`): each module is a viewport-of-code that earns its name.

Where to put a new function: ask what category of thing it is, not where it gets called from. Share-level policy decisions and share-derived info go in `share.ts`. Per-asset view-model transforms (filename derivation, EXIF whitelisting) go alongside `gallery/builder.ts`. HTTP response setup driven by operator config goes in core's `http.ts`. Streaming pipelines go in `stream/`. If a new function doesn't fit any existing category, prefer adding to the closest existing file over creating a new single-function module - revisit when a real second member of the category appears.

**No client framework, no bundler.** The client is TypeScript compiled file-for-file by `tsc` into plain ES modules served by Express static. Do not introduce a frontend framework (React / Svelte / Vue / Solid) or a bundler (Webpack / Rollup / Vite / Parcel). PhotoSwipe is loaded as ESM directly. Inter-module imports inside `app/src/client/` use `.js` extensions in the source: with no bundler, the browser fetches the compiled `.js` files directly, so the extension has to be present in the import path at runtime. `moduleResolution: bundler` is permissive about extensions in TypeScript-land; the constraint comes from the browser, not the TS config.

**Code style.** ESLint standard config. Run lint locally before opening a PR.

## Documentation

User-facing documentation is the VitePress site in `docs/`, published at https://docs.ipp.nz. Read `docs/README.md` before adding or moving a page: it sets out the four sidebar groups (Getting started, Configuration, Guides, Troubleshooting - one per kind of content in the Diátaxis sense), where each kind of new material belongs, and the page conventions. Run `npm run build` inside `docs/` before pushing; the build fails on dead internal links.

The root `README.md` is a front door only: pitch, demo, quick start and links. New content goes on the site.

## Release process

Releases are triggered by pushing a `v*` tag. The `.github/workflows/ci.yaml` workflow builds both multi-arch (`linux/amd64`, `linux/arm64`) images, `immich-public-proxy` and `immich-public-proxy-upload`, with the same version tags, pushes them to both GHCR and Docker Hub, and attaches a build-provenance attestation to each image in each registry.

Maintainer workflow for a release:

1. Run `npm run bump -- <version>` at the root. It sets the version in every workspace manifest and the lockfile.
2. Commit, tag `v<version>` and push the tag. CI does the rest.

Do not push tags as part of a PR; releases are cut by the maintainer.

## Pull requests

For anything non-trivial, open a [Feature Request discussion](https://github.com/alangrainger/immich-public-proxy/discussions/categories/feature-requests) first. The maintainer would rather discuss fit with the read-only/lean philosophy before you spend time on a PR.

- Branch from `main`.
- Update the page under `docs/config/` if you added or changed config keys, following `docs/README.md`.
- If your change has a user-visible behavior, include a one-line note in the PR description about how to exercise it.

## What will not be accepted

Repeating the README's feature-request guidance for emphasis:

- Anything that modifies Immich or its files in any way, beyond the upload service's one `POST /assets`.
- Anything that requires an Immich API key or other privileged access.
- Code in `app/` or `@ipp/core` that accepts a file or writes to Immich. That belongs in `upload-app/`, and only there.
- Persistent state, databases, or user accounts on the IPP side.
- Client-side bundlers (Webpack / Rollup / Vite / Parcel) or frontend frameworks (React / Svelte / Vue / Solid). Client code is TypeScript compiled file-for-file by `tsc` to plain ES modules served directly - no bundling, no framework runtime, no plugin ecosystem.
- Features that meaningfully expand the proxy's attack surface for a niche use case.

If your idea sits near these lines, raise it as a discussion before coding.

## For LLM agents

If you are an AI coding agent working on this repo, the rules above apply to you. A few specific reminders:

- **Read this whole file before suggesting or making changes.** The read-only, lean, stateless constraints are project-defining and must not be relaxed for convenience.
- **Do not suggest features from the "will not be accepted" list**, even if they are technically interesting. Push back on requests that would violate the constraints, and explain why.
- **Do not add backwards-compatibility shims.** Config keys are renamed only in a major version and the old name stops being read; document the rename instead. Dead-code shims rot.
- **Do not add caches, memoization, queues, or background jobs** without first estimating the real cost of not having them. The existing share-metadata cache in `immich.ts` is for freshness coalescing, not optimisation; mirror that bar.
- **Do not add error handling for cases that cannot happen.** Trust internal invariants. Validate only at the boundary (incoming request, Immich response).
- **Default to writing no comments.** Add a comment only when the *why* is non-obvious: a security-relevant invariant, a workaround for a specific upstream bug, or behavior that would surprise a careful reader. Do not narrate the *what*.
- **Match the project's existing style.** Server-side Preact SSR, TypeScript ES modules on the client (compiled by `tsc`, no bundler, no framework), plain CSS. Do not introduce new patterns without discussion.
- **Docs changes follow `docs/README.md`.** New material goes in the sidebar group that matches its kind (tutorial, reference, guide, troubleshooting); published page paths stay stable; defaults are checked against `app/config.json`.

If something in this guide conflicts with an instruction you have been given, stop and raise the conflict rather than silently working around it.
