FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY docs/docusaurus/package.json docs/docusaurus/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm -w docs/docusaurus run build

FROM node:20-alpine AS runner
WORKDIR /repo
COPY --from=build /repo .
EXPOSE 3002
CMD ["npm", "-w", "docs/docusaurus", "run", "serve", "--", "--host", "0.0.0.0", "--port", "3002"]
