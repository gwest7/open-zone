FROM node:20-alpine3.17
LABEL org.opencontainers.image.source https://github.com/gwest7/open-zone

RUN mkdir -p /app

RUN adduser --system app

COPY package*.json /app
RUN (cd app && npm ci --omit=dev)

COPY lib/*.js /app

RUN chown -R app /app
WORKDIR /app
USER app

CMD [ "node", "cli.js", "mqtt" ]