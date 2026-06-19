FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching. Use npm ci when a lockfile is
# present, otherwise fall back to npm install.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# App source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
