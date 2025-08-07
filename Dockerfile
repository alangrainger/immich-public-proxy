FROM node:lts-alpine AS builder

# Maak de map aan en stel juiste rechten in
RUN mkdir /app && chown node:node /app

USER node
WORKDIR /app
COPY --chown=node:node app/ ./

# Zorg dat node_modules map er is en van node is
RUN mkdir -p node_modules && npm ci && npx tsc

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