FROM quay.io/pcdc/node-lts-alpine:18-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM quay.io/pcdc/nginx:1.22-alpine

COPY --from=build-stage /app/build /usr/share/nginx/html
COPY ./nginx /etc/nginx/conf.d
COPY ./dockerStart.sh /dockerStart.sh
RUN chmod +x /dockerStart.sh \
    && chown -R nginx:nginx /usr/share/nginx/html \
    && mkdir -p /var/cache/nginx \
    && chown -R nginx:nginx /var/cache/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx


CMD ["/bin/sh", "/dockerStart.sh"]
