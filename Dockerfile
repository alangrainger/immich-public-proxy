FROM node:lts-alpine

WORKDIR /app

COPY app/ ./

RUN chown -R node:node /app

USER node

RUN npm install --omit=dev

ARG PACKAGE_VERSION
ENV APP_VERSION=${PACKAGE_VERSION}
ENV NODE_ENV=production

# Build without type checking, as we have removed the Typescript
# dev-dependencies above to save space in the final build.
# Type checking is done in the repo before building the image.
RUN npx tsc --noCheck

CMD ["node", "dist/index.js" ]
