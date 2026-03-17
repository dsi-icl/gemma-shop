import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Isomorphic logger using Pino.
 * - Server (Bun): Logs to stdout in structured JSON.
 * - Browser: Logs to console.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    transport: isDev
        ? {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  translateTime: 'HH:MM:ss Z',
                  ignore: 'pid,hostname'
              }
          }
        : undefined,
    browser: {
        asObject: true
    }
});
