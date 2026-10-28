FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY doe ./doe
COPY etudes ./etudes
RUN rm -rf doe/data etudes/data
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/pipefit.db DOE_DB_FILE=/data/doe/doe.db ETUDES_DB_FILE=/data/etudes/etudes.db
VOLUME /data
EXPOSE 3000 3100 3200
# Applications DOE et Études : même image, commandes « node doe/server.js » et « node etudes/server.js » (voir deploy/docker/docker-compose.yml)
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
