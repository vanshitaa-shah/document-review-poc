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

# The UI build, served same-origin by Express — see lib/staticUi.ts.
COPY --from=web-build /web/dist ./public

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run dev"]
