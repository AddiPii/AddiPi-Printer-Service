## Multi-stage Dockerfile for AddiPi Printer Service
## Builder: install deps and compile TypeScript to CommonJS
FROM node:20-bullseye-slim AS builder
WORKDIR /usr/src/app

# Install build tools and deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile TypeScript to CommonJS to avoid ESM/"type" issues
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

## Runner: smaller image with only production deps and compiled code
FROM node:20-slim AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3050

CMD ["node", "dist/index.js"]
