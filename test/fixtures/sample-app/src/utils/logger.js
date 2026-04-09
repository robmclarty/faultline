const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
}

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info']

function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] <= currentLevel) {
    console.log(JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() }))
  }
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta)
}
