const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
// const cache = require('../../middlewares/requestCacheMiddleware') // uncomment the statement whenever the redis cache is in use.

/**
 * @namespace -HEALTH-CHECK-MODULE-
 * @description API’s related to HEALTH CHECK module.
 */
/**
 * @memberof -HEALTH-CHECK-module-
 * @name postPing
 * @path {POST} /api/healthCheck/postPing
 * @description Bussiness Logic :- In ping API, we are just returning the sucess response and data true.
 * @response {string} ContentType=application/json - Response content type.
 * @response {string} metadata.msg=Success  - Response got successfully.
 * @response {string} metadata.data - It will return the data.
 * @code {200} if the msg is success the api returns succcess message.
 * @author Vasim Gujrati, 14th December 2022
 * *** Last-Updated :- Vasim Gujrati, 20th March 2023 ***
 */
const validationSchema = { type: 'object', required: true, properties: { name: { type: 'string', required: true, minLength: 3 } } }
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}
const ping = async (req, res) => {
  try {
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: true })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.post('/postPing', validation, ping)
// router.post('/postPing', cache.route(100), validation, ping) // example for redis cache in routes
module.exports = router
