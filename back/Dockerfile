FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY drizzle.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "src/index.ts"]
