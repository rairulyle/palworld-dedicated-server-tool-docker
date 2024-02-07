import { createLogger, format, transports } from "winston";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const MAX_LOG_FILE_SIZE_MB = Number(process.env.MAX_LOG_FILE_SIZE_MB) || 10;
const ENABLE_LOG_FILE = process.env.ENABLE_LOG_FILE === "true";

const loggerFormat = format.combine(
  format.timestamp({
    format: "MM-DD HH:mm:ss.SSS",
  }),
  format.printf(
    (info) =>
      `${info.timestamp} | ${info.level.padEnd(5)} | ${info.message}` +
      (info.splat !== undefined ? `${info.splat}` : " ")
  )
);

const logger = createLogger({
  level: LOG_LEVEL,
  format: loggerFormat,
  ...(ENABLE_LOG_FILE && {
    transports: [
      new transports.File({
        filename: "logs/watchdog.log",
        maxsize: MAX_LOG_FILE_SIZE_MB * 1000000,
      }),
    ],
  }),
});

logger.add(
  new transports.Console({
    format: loggerFormat,
  })
);

export default logger;
