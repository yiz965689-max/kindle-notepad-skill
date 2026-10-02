FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY fonts ./fonts
USER node
CMD ["node", "src/server.js"]
