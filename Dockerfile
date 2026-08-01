# Build context is this repo (client/), e.g.:
#   docker build -t tidy-nest-client:local .
FROM node:22-alpine AS client-build
WORKDIR /client
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

# ---- runtime ------------------------------------------------------------
# nginx-unprivileged: runs as a non-root user and listens on 8080 out of the
# box, so it drops straight into a k8s runAsNonRoot securityContext with no
# extra plumbing.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=client-build /client/dist /usr/share/nginx/html
# --chown so the entrypoint's IPv6-listen rewrite (runs as uid 101, this
# image's runtime user) can actually edit the file instead of warning.
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
