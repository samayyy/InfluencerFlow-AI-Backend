const __db = require('./../lib/db')
const __constants = require('./../config/constants')
const __config = require('./../config')

const set = async (key, value, expirySec) => {
  try {
    await __db.redis.setex(key, value, expirySec)
  } catch (err) {
    console.log('Error in setting the redis key for cache:: ', err)
    throw new Error(err)
  }
}

const get = async (key) => {
  try {
    const getCached = await __db.redis.get(key)
    return getCached
  } catch (err) {
    console.log('Error in getting the redis key for cache :: ', err)
    throw new Error(err)
  }
}

const cache = (expiryInSec) => {
  if (__db && __db.redis && !__db.redis.connection_status) { console.log('\x1b[31mError :: \nCompiled time Failed\nRedis is not initialised and cache middleware is used.\n'); process.exit(0) }
  return async (req, res, next) => {
    try {
      req.toCached = true
      req.expiryOfCache = expiryInSec
      let key = ''
      if (__config && __config.userBasedCache) {
        key = req.originalUrl + '_' + (req && req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '')
      } else {
        key = req.originalUrl.split('?')[0]
      }
      const cached = await get(key)
      if (cached) {
        req.isCachedResponse = true
        res.send(JSON.parse(cached))
      } else {
        next()
      }
    } catch (err) {
      console.log('Error in cache :: ', err)
      throw new Error(err)
    }
  }
}

const cacheManagement = (req, body) => {
  let key = ''
  if (__config && __config.userBasedCache) {
    key = req.originalUrl + '_' + (req && req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '')
  } else {
    key = req.originalUrl.split('?')[0]
  }
  body = JSON.stringify(body)
  req.expiryOfCache = req.expiryOfCache || __constants.EXPIRY_OF_CACHE
  return { key, data: body }
}

module.exports = {
  route: cache,
  set: set,
  cacheManagement
}
