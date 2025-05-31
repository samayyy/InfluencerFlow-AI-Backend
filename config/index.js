const __constants = require('./constants')
const appName = __constants.APP_NAME
const dbName = __constants.DB_NAME
module.exports = {
  env: process.env.NODE_ENV,
  app_name: appName,
  db_name: dbName,
  api_prefix: appName,
  port: process.env.PORT,
  base_url: process.env.BASE_URL ? process.env.BASE_URL : 'http://localhost:' + process.env.PORT,
  mongo: {
    init: process.env.MONGO_INIT === 'true',
    mongourl: process.env.MONGO_URL
  },
  redis_local: {
    init: process.env.REDIS_INIT === 'true',
    host: process.env.REDIS_HOST,
    no_ready_check: process.env.REDIS_NO_READY_CHECK === 'true',
    port: process.env.REDIS_PORT,
    auth_pass: process.env.REDIS_AUTH_PASS,
    uri: 'redis://' + process.env.REDIS_HOST + ':' + process.env.REDIS_PORT + '/' + process.env.REDIS_DB,
    redisExp: process.env.REDIS_EXP
  },
  authentication: {
    jwtSecretKey: process.env.AUTHENTICATION_JWT_SECRET_KEY,
    internal: {
      allow: process.env.AUTHENTICATION_INTERNAL_ALLOW === 'true'
    }
  },
  apm: {
    enableApm: process.env.APM_ENABLE,
    serviceName: process.env.APM_SERVICE_NAME,
    secretToken: process.env.APM_SECRET_TOKEN,
    serverUrl: process.env.APM_SERVER_URL,
    environment: process.env.APM_ENVIRONMENT,
    logUncaughtExceptions: process.env.APM_LOG_UNCAUGHT_EXCEPTIONS,
    transactionSampleRate: +process.env.APM_TRANSACTION_SAMPLE_RATE
  },
  elastic: {
    initUserActivity: process.env.ELASTIC_INIT_USER_ACTIVITY === 'true',
    cloudId: process.env.ELASTIC_CLOUD_ID,
    username: process.env.ELASTIC_USERNAME,
    password: process.env.ELASTIC_PASSWORD
  },
  vault: {
    endPoint: process.env.VAULT_ENDPOINT,
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.VAULT_SECRET_ID,
    vaultPath: process.env.VAULT_PATH
  },
  addBaseUrlPrefix: process.env.ADD_BASEURL_PREFIX === 'true',
  debugMode: process.env.DEBUG_MODE === 'true',
  userBasedCache: process.env.USER_BASED_CACHE === 'true'
}
