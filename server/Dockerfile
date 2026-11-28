# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node assets/levels/*_layout.json ./assets/levels/
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server/index.js"]
