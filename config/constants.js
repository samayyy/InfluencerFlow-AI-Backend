const APP_NAME = 'framework'
const DB_NAME = 'framework'
const CUSTOM_CONSTANT = {
  DEV_ENV: 'development',
  PROD_ENV: 'production',
  UAT_ENV: 'uat',
  STAG_ENV: 'staging'
}
const PUBLIC_FOLDER_PATH = process.env.PWD + '/public'
const SERVER_TIMEOUT = 20 * 60 * 1000
const VALIDATION = 'validation'
const VALIDATOR = {
  email:
    '^(([^<>()\\[\\]\\.,;:\\s@"]+(\\.[^<>()\\[\\]\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$',
  password:
    '^(?=.*?[A-Z])(?=(.*[a-z]){1,})(?=(.*[\\d]){1,})(?=(.*[\\W]){1,})(?!.*\\s).{8,}$',
  text: '^[a-zA-Z][a-zA-Z ]+$',
  name: /^[a-zA-Z\s]+$/,
  number: '^[0-9]+$',
  aplphaNumeric: '^[a-zA-Z0-9]+$',
  phoneNumber: '^\\d{1,10}$',
  postalCode: '^\\d{1,6}$',
  phoneCode: '^\\d{1,2}$',
  timeStamp:
    '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1]) (2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$',
  aplphaNumericWithUnderscore: '^[a-z0-9_]+$',
  fileExtType: /^(jpg|jpeg|png)$/,
  url: /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/,
  noTabLinebreakSpace: /^(?:(.)(?!\s\s\s\s)(?!\n)(?!\t))*$/g,
  noWhiteSpace: '^[a-zA-Z0-9_]*$',
  phoneNumberWithPhoneCode: '^[\\d+]{1}[0-9]{2}?[0-9]{10}$',
  phoneNumberE164: '^([\\d+]{1})?[0-9]{7,15}$', // e.164 format with min 7 & max 15 with + optional
  aplphaNumericWithUnderscoreAndHyphen: '^[a-zA-Z0-9_-]+$',
  date: '^\\d{4}-\\d{2}-\\d{2}$',
  file: {
    image: {
      pattern: /^(jpg|jpeg|png)$/,
      maxUploadSize: 5 * 1024 * 1024 // 5mb
    }
  }
}

const SESSION_TIME_OUT = 20 * 60 * 1000
const REDIS_EXPIRY_TIME = 3600
const SALT_ROUNDS = 8
const EXPIRY_OF_CACHE = 300
const USER_ACTIVITY_LOGS = 'useractivitylogs'
const V1 = 'v1'
const ARRAY_OF_MEDIUM = ['body', 'params', 'query']

module.exports.RESPONSE_MESSAGES = require('../responses/api-responses')
module.exports.CUSTOM_CONSTANT = CUSTOM_CONSTANT
module.exports.PUBLIC_FOLDER_PATH = PUBLIC_FOLDER_PATH
module.exports.APP_NAME = APP_NAME
module.exports.DB_NAME = DB_NAME
module.exports.SERVER_TIMEOUT = SERVER_TIMEOUT
module.exports.VALIDATION = VALIDATION
module.exports.VALIDATOR = VALIDATOR
module.exports.SESSION_TIME_OUT = SESSION_TIME_OUT
module.exports.REDIS_EXPIRY_TIME = REDIS_EXPIRY_TIME
module.exports.SALT_ROUNDS = SALT_ROUNDS
module.exports.EXPIRY_OF_CACHE = EXPIRY_OF_CACHE
module.exports.USER_ACTIVITY_LOGS = USER_ACTIVITY_LOGS
module.exports.V1 = V1
module.exports.ARRAY_OF_MEDIUM = ARRAY_OF_MEDIUM
