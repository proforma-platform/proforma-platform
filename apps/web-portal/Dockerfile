FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web-portal/package.json apps/web-portal/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm -w apps/web-portal run build

FROM node:20-alpine AS runner
WORKDIR /repo
COPY --from=build /repo .
EXPOSE 3000
CMD ["npm", "-w", "apps/web-portal", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
