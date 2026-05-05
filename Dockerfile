FROM node:20-alpine

WORKDIR /app

# Install all workspace deps
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci --workspaces

# Copy source
COPY client/ ./client/
COPY server/ ./server/

# Build client (Vite) + server (tsc)
RUN npm run build

# Data directory (overridden by Fly volume mount)
RUN mkdir -p /data/uploads

# Run server from its own dir so ../client/dist resolves to /app/client/dist
WORKDIR /app/server
EXPOSE 3000

CMD ["node", "dist/index.js"]
