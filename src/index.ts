import dotenv from "dotenv";
dotenv.config();

import express, { Express, Request, Response } from "express";
import logger from "./lib/logger";
import { serverInfo } from "./lib/palworld/api";
import { initWatchdog, rconReconnect } from "./lib/palworld/watchdog";

const app: Express = express();
const API_PORT = Number(process.env.API_PORT);

app.get("/", async (req: Request, res: Response) => {
  const info = await serverInfo();
  res.json(info);
});

const WATCHDOG_INTERVAL = Number(process.env.WATCHDOG_INTERVAL) || 5;

app.listen(API_PORT, async () => {
  while (!(await rconReconnect())) {
    await new Promise((resolve) => setTimeout(resolve, WATCHDOG_INTERVAL));
  }

  logger.debug(JSON.stringify(await serverInfo()));

  initWatchdog();
});
