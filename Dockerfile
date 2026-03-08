FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Install ALL deps
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./

# Production deps only
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy .env.example as a fallback reference
COPY --from=builder /app/.env.example ./.env.example

EXPOSE 3000

# CMD
CMD ["node", "dist/src/main"]