import dotenv from "dotenv";
import express, { Express, Request, Response } from "express";
import { createLogger, format, transports } from "winston";
import { Player, connect, send, serverInfo } from "./lib/palworld/api";
import { parsePlayerInfo } from "./lib/palworld/utils";

dotenv.config();
const app: Express = express();

const API_PORT = Number(process.env.API_PORT);
const RCON_HOST = process.env.RCON_HOST!;
const RCON_PORT = Number(process.env.RCON_PORT);
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const MAX_RECON_RETRY_COUNT = Number(process.env.MAX_RECON_RETRY_COUNT) || 5;
const JOIN_BROADCAST = process.env.JOIN_BROADCAST === "true";
const LEAVE_BROADCAST = process.env.LEAVE_BROADCAST === "true";
const MAX_LOG_FILE_SIZE_MB = Number(process.env.MAX_LOG_FILE_SIZE_MB) || 10;

const logger = createLogger({
  level: LOG_LEVEL,
  format: format.combine(
    format.timestamp({
      format: "MM-DD HH:mm:ss.SSS",
    }),
    format.printf(
      (info) =>
        `${info.timestamp} | ${info.level.padEnd(5)} | ${info.message}` +
        (info.splat !== undefined ? `${info.splat}` : " ")
    )
  ),
  transports: [
    new transports.File({
      filename: "log/watchdog.log",
      maxsize: MAX_LOG_FILE_SIZE_MB * 1000000,
    }),
  ],
});

// Reconnect in case of connect failure
let retryCount = 0;

async function rconReconnect() {
  try {
    await connect({
      host: RCON_HOST,
      port: RCON_PORT,
      password: RCON_PASSWORD,
    });
    logger.info("Successfully connected to PalServer RCON.");
    retryCount = 0;
    return true;
  } catch (error) {
    retryCount++;
    logger.error("Failed to connect to PalServer");

    if (retryCount >= MAX_RECON_RETRY_COUNT) {
      logger.error(
        `Failed to connect after ${MAX_RECON_RETRY_COUNT} attempts. Exiting...`
      );
      logger.on("finish", () => process.exit(1));
      logger.end();
    }
    return false;
  }
}

async function rconExec(command: string) {
  try {
    if (command === "ShowPlayers") {
      logger.debug(`Sending command: '${command}'`);
    } else {
      logger.info(`Sending command: '${command}'`);
    }
    return await send(command);
  } catch (error) {
    logger.error(`Failed to execute RCON Command: '${command}'`);
    logger.warn("Attempting to reconnect to PalServer RCON.");
    await rconReconnect();
    return null;
  }
}

let playerList: Player[] = [];

async function initWatchdog() {
  logger.info("Entering Watchdog Loop.");

  // Get player list
  const playerResponse = await rconExec("ShowPlayers");
  if (!playerResponse) {
    logger.warn("Skipping watchdog run due to RCON connection failure.");
    return;
  }

  const newPlayerList: Player[] = parsePlayerInfo(playerResponse);

  if (!playerList.length) {
    // Handle first loop run
    playerList = newPlayerList;
  } else {
    // Determine difference between player lists (bit janky this section, maybe refactor at some point)
    const playersJoined = newPlayerList.filter(
      (nplayer) =>
        !playerList.some((player) => nplayer.steamid === player.steamid)
    );
    const playersLeft = playerList.filter(
      (player) =>
        !newPlayerList.some((nplayer) => nplayer.steamid === player.steamid)
    );

    // Broadcast join messages
    if (JOIN_BROADCAST) {
      playersJoined.forEach(async (jplayer) => {
        logger.info(`Detected Player Join: ${JSON.stringify(jplayer)}`);
        await rconExec(
          `Broadcast ${jplayer["name"].replace(" ", "_")}_joined_the_world.`
        );
      });
    }

    // Broadcast leave messages
    if (LEAVE_BROADCAST) {
      playersLeft.forEach(async (lplayer) => {
        logger.info(`Detected Player Leave: ${JSON.stringify(lplayer)}`);
        await rconExec(
          `Broadcast ${lplayer["name"].replace(" ", "_")}_left_the_world.`
        );
      });
    }
  }

  playerList = newPlayerList;
}

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Server");
});

const WATCHDOG_INTERVAL = Number(process.env.WATCHDOG_INTERVAL) || 5;

app.listen(API_PORT, async () => {
  logger.debug(
    `RCON Connection: ${JSON.stringify({
      host: RCON_HOST,
      port: RCON_PORT,
      password: RCON_PASSWORD,
    })}`
  );

  while (!(await rconReconnect())) {
    await new Promise((resolve) => setTimeout(resolve, WATCHDOG_INTERVAL));
  }

  logger.debug(JSON.stringify(await serverInfo()));

  setInterval(() => initWatchdog(), WATCHDOG_INTERVAL * 1000);
});
