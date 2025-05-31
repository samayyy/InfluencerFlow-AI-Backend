// LOAD ENV FILE START ==================================================
if (process.env.NODE_ENV === 'development') require('dotenv').config({ path: process.env.PWD + '/.env' })
// LOAD ENV FILE END ====================================================

async function startNodeApp () {
  if (process.env.USE_VAULT === 'true') await require('./lib/util/vault').run()
  var apm = require('elastic-apm-node')
  const __config = require('./config/index')
  if (process.env.NODE_ENV === 'development') console.debug = function () {}
  if (__config && __config.apm && __config.apm.enableApm) {
    apm.start({
    // Override the service name from package.json
    // Allowed characters: a-z, A-Z, 0-9, -, _, and space
      serviceName: __config.apm.serviceName,
      // Use if APM Server requires a secret token
      secretToken: __config.apm.secretToken,
      // Set the custom APM Server URL (default: http://localhost:8200)
      serverUrl: __config.apm.serverUrl,
      // Set the service environment
      environment: __config.apm.environment,
      logUncaughtExceptions: __config.apm.logUncaughtExceptions,
      transactionSampleRate: __config.apm.transactionSampleRate
    })
  }
  console.log('Loaded config environment : ' + process.env.NODE_ENV)
  require('./app.js').worker.start()
}

startNodeApp()
