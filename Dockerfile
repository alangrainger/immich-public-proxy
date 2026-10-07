# The builder runs on the build host's own architecture whatever the target.
# Every production dependency is pure JavaScript and the native tooling
# (esbuild, rolldown, lightningcss) is dev-only, so the install and compile
# never need emulation; only the small runner stage below is built per target.
FROM --platform=$BUILDPLATFORM node:lts-alpine AS builder

# /ipp must be node-owned for npm ci; WORKDIR leaves it root-owned on some builders
RUN mkdir /ipp && chown node:node /ipp

USER node
WORKDIR /ipp

# npm ci needs the manifest of every workspace in the root `workspaces` array
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node shared/package.json shared/
COPY --chown=node:node app/package.json app/
COPY --chown=node:node upload-app/package.json upload-app/
RUN npm ci --workspace=app

COPY --chown=node:node shared/ shared/
COPY --chown=node:node app/ app/
RUN npm run build --workspace=shared --workspace=app

# Production tree with @ipp/core dereferenced from its workspace symlink into a
# real folder (cp -L), so the runner's /app is self-contained. The apps'
# workspace links go first: the runner has IPP at /app, and the upload app
# has no place in this image.
RUN rm -rf node_modules \
    && npm ci --workspace=app --omit=dev \
    && rm -rf node_modules/immich-public-proxy node_modules/immich-public-proxy-upload node_modules/.bin/immich-public-proxy* \
    && cp -rL node_modules /ipp/prod_modules \
    && cd /ipp/prod_modules/@ipp/core \
    && rm -rf src tests tsconfig.json vitest.config.ts dist/tsconfig.tsbuildinfo \
    && rm -f /ipp/app/dist/tsconfig.tsbuildinfo

FROM node:lts-alpine AS runner

RUN apk --no-cache add curl tini \
    && mkdir /app && chown node:node /app

# IPP stays at /app so the documented mounts (/app/config.json,
# /app/dist/invalidRequestHandler.js) and the IPP_CONFIG default keep working
USER node
WORKDIR /app
COPY --from=builder --chown=node:node /ipp/app/package.json ./
COPY --from=builder --chown=node:node /ipp/prod_modules ./node_modules
COPY --from=builder --chown=node:node /ipp/app/dist ./dist
COPY --from=builder --chown=node:node /ipp/app/public ./public
COPY --from=builder --chown=node:node /ipp/app/config.json ./

ARG PACKAGE_VERSION
ENV APP_VERSION=${PACKAGE_VERSION}
ENV NODE_ENV=production

# tini as PID 1 reaps orphaned healthcheck processes, which node does not (GitHub #66).
# -s keeps reaping, without a warning, when PID 1 is already an init (compose `init: true`).
ENTRYPOINT ["/sbin/tini", "-s", "--"]
CMD ["node", "dist/index.js" ]
