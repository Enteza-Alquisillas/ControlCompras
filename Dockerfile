# build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies for build
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
# We disable lint and typecheck during docker build to speed up and avoid common issues
# unless the user wants them enabled.
RUN npm run build

# production stage
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built app and necessary files
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "start"]
