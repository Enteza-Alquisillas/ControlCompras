# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for mssql
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for mssql
RUN apk add --no-cache python3 make g++ unixodbc-dev

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p /app/logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S enteza -u 1001 -G nodejs && \
    chown -R enteza:nodejs /app

USER enteza

# Set default environment
ENV NODE_ENV=production
ENV LOG_DIR=/app/logs

ENTRYPOINT ["node", "dist/index.js"]
