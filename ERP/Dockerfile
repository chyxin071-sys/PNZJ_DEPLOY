FROM node:22-alpine AS erp-builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

FROM node:22-alpine AS studio-admin-deps
WORKDIR /studio-admin
COPY studio-admin/package*.json ./
RUN npm ci

FROM node:22-alpine AS studio-admin-builder
WORKDIR /studio-admin
COPY --from=studio-admin-deps /studio-admin/node_modules ./node_modules
COPY studio-admin/ ./
COPY --from=erp-builder /app/dist ./public/erp
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:22-alpine
WORKDIR /studio-admin
ENV NODE_ENV=production
ENV PORT=80
COPY studio-admin/package*.json ./
COPY --from=studio-admin-builder /studio-admin/node_modules ./node_modules
COPY --from=studio-admin-builder /studio-admin/dist ./dist
COPY --from=studio-admin-builder /studio-admin/app ./app
COPY --from=studio-admin-builder /studio-admin/public ./public
COPY --from=studio-admin-builder /studio-admin/scripts ./scripts
COPY --from=studio-admin-builder /studio-admin/next.config.ts ./next.config.ts
COPY --from=studio-admin-builder /studio-admin/tsconfig.json ./tsconfig.json
EXPOSE 80
CMD ["node", "scripts/start-unified.mjs"]
