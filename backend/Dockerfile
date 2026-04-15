FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for sharp (libvips)
RUN apk add --no-cache \
    vips-dev \
    fftw-dev \
    gcc \
    g++ \
    make \
    python3

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .

FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime deps for sharp
RUN apk add --no-cache vips

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/db ./db
COPY package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
