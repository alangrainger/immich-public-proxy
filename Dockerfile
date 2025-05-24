FROM node:lts-alpine as builder

USER node
WORKDIR /app
COPY -chown=node:node app/ ./

RUN npm ci \
    && npx tsc 

FROM node:lts-alpine as runner

USER node
WORKDIR /app
COPY --chown=node:node app/ ./

RUN apk --no-cache add curl \
    && npm ci --omit=dev

ARG PACKAGE_VERSION
ENV APP_VERSION=${PACKAGE_VERSION}
ENV NODE_ENV=production

CMD ["node", "dist/index.js" ]
