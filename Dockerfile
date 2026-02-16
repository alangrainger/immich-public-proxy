FROM node:lts-alpine AS builder

USER node
WORKDIR /app
COPY --chown=node:node app/ ./

RUN npm ci \
    && npx tsc

FROM node:lts-alpine AS runner

RUN apk --no-cache add curl

USER node
WORKDIR /app
COPY --from=builder --chown=node:node app/ ./

RUN npm ci --omit=dev

ARG PACKAGE_VERSION
ENV APP_VERSION=${PACKAGE_VERSION}
ENV NODE_ENV=production

CMD ["node", "dist/index.js" ]
