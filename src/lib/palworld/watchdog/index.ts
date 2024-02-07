import logger from "../../logger";
import { Player, connect, send } from "../api";
import { parsePlayerInfo } from "../utils";

const HOST = process.env.HOST!;
const GAME_SERVER_PORT = Number(process.env.GAME_SERVER_PORT);
const RCON_PORT = Number(process.env.RCON_PORT);
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const MAX_RECON_RETRY_COUNT = Number(process.env.MAX_RECON_RETRY_COUNT) || 5;
const ENABLE_JOIN_BROADCAST = process.env.ENABLE_JOIN_BROADCAST === "true";
const ENABLE_LEAVE_BROADCAST = process.env.ENABLE_LEAVE_BROADCAST === "true";
const WATCHDOG_INTERVAL = Number(process.env.WATCHDOG_INTERVAL) || 5;

// Reconnect in case of connect failure
let retryCount = 0;
export async function rconReconnect() {
  try {
    await connect({
      host: HOST,
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

async function broadcastJoin(player: Player) {
  logger.info(`Detected Player Join: ${JSON.stringify(player)}`);
  await rconExec(
    `Broadcast ${player.name.replace(" ", "_")}_joined_the_world.`
  );
}

async function broadcastLeave(player: Player) {
  logger.info(`Detected Player Leave: ${JSON.stringify(player)}`);
  await rconExec(`Broadcast ${player.name.replace(" ", "_")}_left_the_world.`);
}

let playerList: Player[] = [];

export async function initWatchdog() {
  const playerResponse = await rconExec("ShowPlayers");
  const newPlayerList: Player[] = parsePlayerInfo(playerResponse);

  if (playerList.length) {
    if (!playerResponse) {
      logger.warn("Skipping watchdog run due to RCON connection failure.");
      return;
    }

    const playersJoined = newPlayerList.filter(
      (nplayer) =>
        !playerList.some((player) => nplayer.steamid === player.steamid)
    );

    const playersLeft = playerList.filter(
      (player) =>
        !newPlayerList.some((nplayer) => nplayer.steamid === player.steamid)
    );

    if (ENABLE_JOIN_BROADCAST) {
      await Promise.all(playersJoined.map(broadcastJoin));
    }

    if (ENABLE_LEAVE_BROADCAST) {
      await Promise.all(playersLeft.map(broadcastLeave));
    }
  }

  playerList = newPlayerList;
  setTimeout(initWatchdog, WATCHDOG_INTERVAL * 1000);
}
