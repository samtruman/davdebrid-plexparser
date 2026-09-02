FROM node:20-slim

# procps provides useful process diagnostics (ps, etc.) for troubleshooting.
RUN apt-get update \
  && apt-get install -y --no-install-recommends procps \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /home/node/app \
  && chown -R node:node /home/node/app \
  && mkdir -p /data \
  && chown -R node:node /data

WORKDIR /home/node/app

COPY --chown=node:node package*.json ./

USER node

RUN npm install

COPY --chown=node:node ./src ./src

EXPOSE 4000

CMD [ "node", "src/index.js" ]
