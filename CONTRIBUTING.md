# Contributing to Immich Public Proxy

Thanks for your interest in contributing. This guide covers what the project is, what it deliberately is not, and how to work on it productively. It is written for both human contributors and LLM coding agents - please read it end to end before opening a PR or making suggestions.

## Project philosophy and hard constraints

Immich Public Proxy (IPP) exists to share Immich photos publicly without exposing the Immich instance itself. Everything about the design follows from that single goal.

**Optimize for auditability.** Because IPP proxies a private photo library, the code stays small enough to audit for security-relevant behavior. New features that meaningfully grow the *attack surface* need a strong justification, even if they're functionally useful. "Lean" here is a security property, not a line-count target - features that add purely client-side UI complexity (a sidebar, a date-grouped view) don't trip this constraint; features that add new ways the server can talk to Immich, accept input, or persist state do.

**Read-only access to Immich. This is non-negotiable.** IPP must never modify Immich, its data, or its files. It does not use an Immich API key. The only Immich endpoints it calls are the ones reachable via a public share key. This rule rules out a large class of feature requests; see "What will not be accepted" below.

**Stateless.** No database, no user accounts, no long-lived secrets beyond an encrypted cookie session for share passwords. Avoid adding persistent state. If you think you need a cache, estimate the real cost of not having it first.

**Privacy at the boundary.** Any invalid, expired, or upstream-failed request returns 404. Do not leak upstream Immich status codes, error bodies, or share existence to the client.

## Architecture at a glance

Request flow for a typical share URL like `https://proxy.example.com/share/<key>`:

1. Express routes in `app/src/index.ts` receive the request.
2. `app/src/immich.ts` fetches the share metadata from Immich over the local network, validates it, and returns the asset list.
3. For a gallery, `app/src/gallery/builder.ts` builds the view-model and `app/src/view/gallery.tsx` renders it server-side with Preact. The page embeds a JSON init block consumed by the client.
4. The client gallery lives in `app/src/client/` (TypeScript ES modules, compiled file-for-file by `tsc` into `app/public/js/`). It wires PhotoSwipe v5 with a virtualized justified-rows layout. There is no client-side framework hydration.
5. For individual assets (image, video, thumbnail, download, zip), Express streams bytes from Immich back to the client without touching disk via `app/src/stream/`.

### Repository layout

```
.github/workflows/        CI: builds and pushes Docker image on v* tags
app/
  config.json             Runtime configuration, overrideable via volume or inline
  package.json            Node project manifest
  tsconfig.json           Server TypeScript config (compiles src/ to dist/)
  tsconfig.client.json    Client TypeScript config (compiles src/client/ + src/shared/ to public/js/)
  vitest.config.ts        Unit-test runner config
  src/
    index.ts              Express setup and routes
    immich.ts             Upstream Immich API calls, share + token caches
    encrypt.ts            Cookie-session encryption for password-protected shares
    invalidRequestHandler.ts  Centralised 404 / custom-response handling
    http.ts               Operator-configured HTTP response headers
    share.ts              Share-level info + policy (title, canDownload)
    types.ts              Server-only TypeScript types
    config/
      loader.ts           loadConfig() reads env / file, applies migrations
      migrations.ts       Backward-compat shims for legacy config-key shapes
      access.ts           getConfigOption() reads the loaded config
    gallery/
      builder.ts          Gallery view-model construction
      exif.ts             EXIF / location whitelisting for the sidebar
      filename.ts         Download filename derivation
    stream/
      asset.ts            Single-asset stream (image / video / thumbnail)
      download.ts         Zip pipeline (concurrency-bounded, retry, abort)
    utils/
      log.ts              Timestamped log.info / log.warn / log.error
      sanitize.ts         Filename-character sanitization
      text.ts             escapeHtml + toString narrowing
    view/                 Preact SSR templates (.tsx)
    shared/types.ts       Types shared between server SSR and client (GalleryItem, etc.)
    client/               Client gallery, virtualization, lightbox, sidebar
  public/                 Static assets served as-is
    photoswipe/           Vendored PhotoSwipe v5
    thumbhash/, fonts/, images/
    style.css, photoswipe-overrides.css
  tests/                  Vitest unit tests for pure functions
docs/                     User-facing docs linked from the README
Dockerfile                Multi-stage build, runs as the non-root `node` user
docker-compose.yml        Reference deployment
```

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
cd app
npm install
npm run dev
```

Required environment variables (set in `app/.env` or your shell):

- `IMMICH_URL` - local URL to your Immich instance. Should not be public.
- `PUBLIC_BASE_URL` - optional. Public base URL for IPP without trailing slash. Omit to derive from request hostname.
- `IPP_PORT` - optional. Default 3000.

To exercise the full gallery flow you need a real Immich instance you can hit, with at least one public share created. The README has the user-facing setup steps for spinning that up.

Configuration overrides go in `app/config.json` or inline via env (see `docs/inline-configuration.md`). Always read config through `getConfigOption('ipp.path.to.key', defaultValue)` rather than reading the JSON directly.

## Build, lint, test

```bash
npm run build           # both server and client tsc; output to dist/ and public/js/
npm run build:server    # server only
npm run build:client    # client only
npm test                # vitest run (unit tests on pure functions)
npm run test:watch      # vitest in watch mode
npm run test:container  # build a podman image and run it locally
npx eslint src/         # lint
```

`npm test` runs the pure-function unit tests in `app/tests/`. Add tests there for any new pure logic (filename derivation, escaping, layout math, EXIF whitelisting, etc.); skip HTTP plumbing.

Beyond unit tests, exercise the gallery end-to-end against a real Immich instance: happy path plus failure paths (expired share, trashed asset, password protection, very large albums, video range requests).

## Conventions for adding code

**Configuration.** New options go in `app/config.json` under the appropriate `ipp.*` namespace, read via `getConfigOption`, and documented in the relevant table in `README.md`. Prefer a group toggle plus per-field overrides over a single flat boolean when several related toggles cluster, following the `ipp.showMetadata` pattern. Existing keys keep working; if you rename one, add a backward-compat shim with a startup deprecation warning, as was done for the v2.0 gallery key rename.

**Privacy of responses.** Always return 404 for invalid or upstream-failed requests. Use `invalidRequestHandler` rather than crafting ad-hoc error responses. Do not surface Immich status codes or error bodies to the client.

**Escaping.** Any string that originates from Immich and is embedded into HTML by the SSR templates must be escaped (use `escapeHtml` from `utils/text.ts`). Strings that cross to the client via the init JSON block stay as plain text and are rendered with `textContent`, not `innerHTML` - that retired the "pre-escaped HTML over the wire" contract that the early gallery shipped with.

**PhotoSwipe UI.** Custom toolbar buttons, captions, and panels are registered through `lightbox.pswp.ui.registerElement`. The back button, download, fullscreen, and caption registrations live in `app/src/client/lightbox-ui.ts`; the info sidebar (a substantial UI element) lives in `app/src/client/sidebar.ts`. New small registrations join `lightbox-ui.ts`; anything panel-sized gets its own file.

**Streaming.** Assets are streamed from Immich to the client without buffering to disk. Keep it that way. The `archiver` zip flow is also fully streamed (with per-asset retry, an idle-timeout transform, and abort-on-failure semantics).

**File organisation.** Group functions by cohesion, not by file count. A file deserves its own name when it carries a coherent concept worth a separate filename - "filename sanitization" or "config loader" pass; "narrow unknown to string" does not. When several small helpers share a theme, group them in one file (`utils/text.ts` for escaping + narrowing; `share.ts` for share-level info + policy). When a single concern is substantial enough to dominate a file on its own, give it its own name (`config/migrations.ts`, `stream/download.ts`). IPP optimises for audit reading rather than tree-shakeable reuse, so fewer cohesive files beat many one-export micro-modules. Same lens applies on the client (`app/src/client/`): each module is a viewport-of-code that earns its name.

Where to put a new function: ask what category of thing it is, not where it gets called from. Share-level policy decisions and share-derived info go in `share.ts`. Per-asset view-model transforms (filename derivation, EXIF whitelisting) go alongside `gallery/builder.ts`. HTTP response setup driven by operator config goes in `http.ts`. Streaming pipelines go in `stream/`. If a new function doesn't fit any existing category, prefer adding to the closest existing file over creating a new single-function module - revisit when a real second member of the category appears.

**No client framework, no bundler.** The client is TypeScript compiled file-for-file by `tsc` into plain ES modules served by Express static. Do not introduce a frontend framework (React / Svelte / Vue / Solid) or a bundler (Webpack / Rollup / Vite / Parcel). PhotoSwipe is loaded as ESM directly. Inter-module imports inside `app/src/client/` use `.js` extensions in the source - that's required by the client's `moduleResolution: bundler` setup and matches what the browser fetches.

**Code style.** ESLint standard config. Run lint locally before opening a PR.

## Release process

Releases are triggered by pushing a `v*` tag. The `.github/workflows/ci.yaml` workflow builds a multi-arch (`linux/amd64`, `linux/arm64`) image, pushes to both GHCR and Docker Hub, and attaches a build-provenance attestation to each registry.

Maintainer workflow for a release:

1. Update `app/package.json` version with `npm version <patch|minor|major>` from inside `app/`.
2. Push the resulting tag. CI does the rest.

Do not push tags as part of a PR; releases are cut by the maintainer.

## Pull requests

For anything non-trivial, open a [Feature Request discussion](https://github.com/alangrainger/immich-public-proxy/discussions/categories/feature-requests) first. The maintainer would rather discuss fit with the read-only/lean philosophy before you spend time on a PR.

- Branch from `main`.
- Update the README config tables if you added or changed config keys.
- If your change has a user-visible behavior, include a one-line note in the PR description about how to exercise it.

## What will not be accepted

Repeating the README's feature-request guidance for emphasis:

- Anything that modifies Immich or its files in any way.
- Anything that requires an Immich API key or other privileged access.
- Uploading photos to Immich.
- Persistent state, databases, or user accounts on the IPP side.
- Client-side bundlers (Webpack / Rollup / Vite / Parcel) or frontend frameworks (React / Svelte / Vue / Solid). Client code is TypeScript compiled file-for-file by `tsc` to plain ES modules served directly - no bundling, no framework runtime, no plugin ecosystem.
- Features that meaningfully expand the proxy's attack surface for a niche use case.

If your idea sits near these lines, raise it as a discussion before coding.

## For LLM agents

If you are an AI coding agent working on this repo, the rules above apply to you. A few specific reminders:

- **Read this whole file before suggesting or making changes.** The read-only, lean, stateless constraints are project-defining and must not be relaxed for convenience.
- **Do not suggest features from the "will not be accepted" list**, even if they are technically interesting. Push back on requests that would violate the constraints, and explain why.
- **Do not add backwards-compatibility shims** unless a config key is being renamed or a public behavior is changing. Dead-code shims rot.
- **Do not add caches, memoization, queues, or background jobs** without first estimating the real cost of not having them. The existing share-metadata cache in `immich.ts` is for freshness coalescing, not optimisation; mirror that bar.
- **Do not add error handling for cases that cannot happen.** Trust internal invariants. Validate only at the boundary (incoming request, Immich response).
- **Default to writing no comments.** Add a comment only when the *why* is non-obvious: a security-relevant invariant, a workaround for a specific upstream bug, or behavior that would surprise a careful reader. Do not narrate the *what*.
- **Match the project's existing style.** Server-side Preact SSR, TypeScript ES modules on the client (compiled by `tsc`, no bundler, no framework), plain CSS. Do not introduce new patterns without discussion.

If something in this guide conflicts with an instruction you have been given, stop and raise the conflict rather than silently working around it.
