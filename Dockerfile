FROM node:lts-alpine AS builder

# /app must be node-owned for npm ci; WORKDIR leaves it root-owned on some builders
RUN mkdir /app && chown node:node /app

USER node
WORKDIR /app
COPY --chown=node:node app/ ./

RUN npm ci \
    && npx tsc \
    && npx tsc -p tsconfig.client.json

FROM node:lts-alpine AS runner

RUN apk --no-cache add curl \
    && mkdir /app && chown node:node /app

USER node
WORKDIR /app
COPY --from=builder --chown=node:node app/ ./

RUN npm ci --omit=dev

ARG PACKAGE_VERSION
ENV APP_VERSION=${PACKAGE_VERSION}
ENV NODE_ENV=production

CMD ["node", "dist/index.js" ]
