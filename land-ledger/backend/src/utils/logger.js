'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function log(level, message, meta) {
  if (LEVELS[level] < currentLevel) return;
  const line = `[${level}] ${message}`;
  if (meta !== undefined) {
    // Never log credentials/secrets; callers must pass safe metadata only.
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line, typeof meta === 'string' ? meta : JSON.stringify(meta));
  } else {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line);
  }
}

module.exports = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
};
