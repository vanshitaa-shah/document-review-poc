FROM node:22-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ .
RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY api/package.json api/package-lock.json* ./
RUN npm install

COPY api/ .
RUN npx prisma generate
RUN npm run build

# The UI build, served same-origin by Express — see lib/staticUi.ts.
COPY --from=web-build /web/dist ./public

EXPOSE 3000

# Render (and most hosts) inject $PORT; src/index.ts honors it.
# seed-if-empty is a no-op once real data exists, so this CMD is the same in
# dev and production — a fresh clone/volume boots seeded, a live DB never is.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed-if-empty.ts && exec node dist/index.js"]
