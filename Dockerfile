FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY doe ./doe
RUN rm -rf doe/data
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/pipefit.db DOE_DB_FILE=/data/doe/doe.db
VOLUME /data
EXPOSE 3000 3100
# Application DOE : même image, commande « node doe/server.js » (voir deploy/docker/docker-compose.yml)
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
