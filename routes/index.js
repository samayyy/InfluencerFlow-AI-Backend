// const dateUtil = require('date-format-utils')
const __config = require('../config')
const fs = require('fs')
const path = require('path')
const moment = require('moment')
const cache = require('./../middlewares/requestCacheMiddleware')
const UserActivityLogs = require('./../middlewares/UserActivityLogs')
const __constants = require('./../config/constants')
const sendResponse = require('../responses/sendResponse')

module.exports = async function (app) {
  app.all('*', function (req, res, next) {
    const startTime = new Date()
    if (__config.debugMode) {
      req.req_ip = (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',').shift().trim() : req.ip)
      const startTime = new Date()
      req.req_t = startTime
      console.log('=> API REQUEST:: ', {
        req_ip: req.req_ip,
        uri: req.originalUrl,
        req_t: moment(startTime).format()
      })
    }
    res.on('finish', function (data) {
      if (__config.debugMode) {
        const endTime = new Date()
        const responseTime = endTime - startTime
        console.log('=> API RESPONSE:: ', {
          req_ip: req.req_ip,
          uri: req.originalUrl,
          req_t: moment(startTime).format(),
          res_t: moment(endTime).format(),
          res_in: (responseTime / 1000) + 'sec'
        })
      }
    })
    next()
  })
  app.use('/', (req, res, next) => {
    const old = res.json.bind(res)
    try {
      res.json = async (body) => {
        old(body)
        if (req.logUserActivities) { UserActivityLogs.userActivityLogMiddleware(req, body) }
        if (res && res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && req && !req.isCachedResponse && req.toCached) {
          const { key, data } = cache.cacheManagement(req, body)
          await cache.set(key, data, req.expiryOfCache)
        }
      }
    } catch (err) {
      console.debug('Error in setting the key And app.use() :: ', err)
      throw new Error(err)
    }
    res.sendJson = (options) => sendResponse.send(res, options)
    next()
  })
  const apiPrefix = __config.addBaseUrlPrefix === true ? '/' + __config.api_prefix : ''
  const apiUrlPrefix = apiPrefix + '/api'
  const appModulePath = `${__dirname}./../controllers/`
  fs.readdirSync(path.resolve(appModulePath)).forEach((folder) => {
    if (fs.existsSync(path.resolve(appModulePath + folder))) {
      fs.readdirSync(path.resolve(appModulePath + folder)).forEach((file) => {
        if (file) {
          if (require(path.resolve(appModulePath + folder + '/' + file)).stack) {
            app.use(apiUrlPrefix + '/' + folder, require(path.resolve(appModulePath + folder + '/' + file)))
            const routeToCheckValidator = require(path.resolve(appModulePath + folder + '/' + file)).stack[0]
            if (routeToCheckValidator && routeToCheckValidator.route && routeToCheckValidator.route.stack && !routeToCheckValidator.route.stack.filter(ele => ele.name === __constants.VALIDATION).length) {
              console.log('\x1b[31m Error :: \nCompiled time Failed\nValidation not present in API\n'); process.exit(0)
            }
          }
        }
      })
    }
  })
}
