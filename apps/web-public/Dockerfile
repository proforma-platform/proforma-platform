FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web-public/package.json apps/web-public/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm -w apps/web-public run build

FROM node:20-alpine AS runner
WORKDIR /repo
COPY --from=build /repo .
EXPOSE 4321
CMD ["npm", "-w", "apps/web-public", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4321"]
