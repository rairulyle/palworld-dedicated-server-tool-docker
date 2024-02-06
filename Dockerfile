FROM node:16

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .

ENV PUID=1000 \
    PGID=1000 \
    API_PORT=3000 \
    RCON_HOST= \
    RCON_PORT= \
    RCON_PASSWORD= \
    WATCHDOG_INTERVAL= \
    MAX_RECON_RETRY_COUNT= \
    JOIN_BROADCAST= \
    LEAVE_BROADCAST= \
    MAX_LOG_FILE_SIZE_MB= \

RUN npm install -g pnpm
RUN pnpm install

COPY . .

CMD ["pnpm", "start"]