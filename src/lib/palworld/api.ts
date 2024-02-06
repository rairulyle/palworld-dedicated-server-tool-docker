import { parseCSV } from "./utils";
import RCONClient from "./rcon/client";

export interface Player {
  name: string;
  playeruid: string;
  steamid: string;
}

export interface RconResponse {
  error?: string;
  players: Player[];
  serverName: string;
  serverVersion: string;
}

export interface RconOptions {
  host: string;
  port: number;
  password?: string;
}

let client: RCONClient;

export const connect = async (options: RconOptions) => {
  client = new RCONClient(options.host, options.port);
  await client.connect(options.password || "");
};

export const send = async (command: string) => {
  const response = await client.sendCommand(command);
  return response.toString().replace(/\u0000/g, "");
};

export const serverInfo = async (): Promise<RconResponse> => {
  const getServerName = await client.sendCommand("Info");
  const message = getServerName.toString();
  const parts = message.split("[");
  const serverVersion = parts[1].split("]")[0];
  const serverName = parts[1]
    .split("]")[1]
    .replace(/[\n\u0000]+$/, "")
    .trim();
  const getplayers = await client.sendCommand("ShowPlayers");

  const playerlist = parseCSV(
    getplayers.toString().replace(/\u0000/g, "")
  ).filter((x: Player) => x.playeruid);

  return {
    players: playerlist,
    serverName,
    serverVersion,
  };
};
