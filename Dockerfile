FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=80

WORKDIR /app

COPY --chown=node:node server.mjs ./
COPY --from=build --chown=node:node /app/dist ./dist

RUN mkdir -p /app/data

# WeChat Cloud Hosting is configured to expose port 80.
USER root

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
