import winston from 'winston'
import path from 'path'
import fs from 'fs'

let logger: winston.Logger | null = null

export function initLogger(level: string, logDir: string): winston.Logger {
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const today = new Date().toISOString().split('T')[0]
  const logFile = path.join(logDir, `sync-${today}.log`)

  logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'enteza-sync' },
    transports: [
      // Console output
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length > 1
              ? ` ${JSON.stringify(meta, null, 0)}`
              : ''
            return `${timestamp} [${level}]: ${message}${metaStr}`
          })
        ),
      }),
      // File output
      new winston.transports.File({
        filename: logFile,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      }),
    ],
  })

  return logger
}

export function getLogger(): winston.Logger {
  if (!logger) {
    // Return a default console logger if not initialized
    return winston.createLogger({
      level: 'info',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()],
    })
  }
  return logger
}
