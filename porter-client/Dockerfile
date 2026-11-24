# syntax=docker/dockerfile:1
# Porter web client — build with Node, serve with nginx (which also reverse-proxies /api to the API,
# keeping the app same-origin so the refresh cookie can be SameSite=Strict). Context: ./porter-client
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/porter-client/browser /usr/share/nginx/html
ENV API_UPSTREAM=http://api:8080
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
