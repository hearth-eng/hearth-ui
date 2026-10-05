FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /certs /app/logs && chown -R node:node /app /certs
# (named hearth-entrypoint.sh because the node image already has a docker-entrypoint.sh)
COPY --chmod=755 hearth-entrypoint.sh /usr/local/bin/hearth-entrypoint.sh
USER node
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/hearth-entrypoint.sh"]
# change server.js to your actual entry file (or use ["npm","start"])
CMD ["node", "server.js"]
