
const __constants = require('./../config/constants')

const _ = require('lodash')
module.exports = {
  send: (response, options) => {
    if (options.custom_response) {
      return response.status(options.custom_status_code || 200).json(options.custom_response)
    }

    const resData = {}
    let code = __constants.RESPONSE_MESSAGES.INVALID_CODE.code
    let msg = __constants.RESPONSE_MESSAGES.INVALID_CODE.message
    let data = options.data || null
    let err = options.err || null
    if (!module.exports.isEmpty(options.type) && !module.exports.findMissingKeyInObject(options.type, ['code', 'message'])) {
      code = options.type.code
      msg = options.type.message
    }
    if (options.custom_code) { code = options.custom_code }
    if (options.custom_msg) { msg = options.custom_msg }

    if (code === __constants.RESPONSE_MESSAGES.INVALID_CODE.code) {
      msg = __constants.RESPONSE_MESSAGES.INVALID_CODE.message
      data = null
      err = "Response code not mention so default INVALID_CODE response code selected. please mention valid response code, refer 'constants >> RESPONSE_MESSAGES object'"
    }

    const validCodeObj = module.exports.validateResponseCode(code)
    if (!validCodeObj.valid) { console.debug("add response code '" + code + "' in constants >> RESPONSE_MESSAGES object") }
    resData.code = code
    resData.msg = msg
    resData.data = data
    resData.error = err
    if (!response.is_sent) {
      response.is_sent = true
      if (!_.isEmpty(options.headers) && !_.isArray(options.headers) && _.isPlainObject(options.headers)) {
        response.set(options.headers)
      }
      response.status(validCodeObj.statusCode || 200).json(resData)
    }
  },
  playResponse: (res, err, data, message) => {
    if (err) {
      res.status(500).json({
        error: err,
        value: false,
        message: message
      })
    } else if (data) {
      res.json({
        data: data,
        value: true,
        message: message
      })
    } else {
      res.json({
        data: 'No Data Found',
        value: false,
        message: message
      })
    }
  },
  isEmpty: (obj) => {
    // null and undefined are "empty"
    if (obj === 0 || obj === false) { return false }

    if (obj === undefined || obj === null || obj === '') { return true }

    if (typeof obj === 'number' || typeof obj === 'string' || typeof obj === 'boolean') { return false }
    // Assume if it has a length property with a non-zero value
    // that property is correct.
    if (obj.length > 0) { return false }
    if (obj.length <= 0) { return true }

    // Otherwise, does it have any properties of its own?
    // Note that module.exports doesn't handle
    // toString and valueOf enumeration bugs in IE < 9
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) { return false }
    }
    return true
  },
  findMissingKeyInObject: (obj, keyList) => {
    const missingKeys = []
    if (keyList && keyList.length > 0) {
      _.each(keyList, function (key) {
        if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === null) { missingKeys.push(key) }
      })
    }
    if (missingKeys.length === 0) { return false } else { return missingKeys.toString() }
  },
  validateResponseCode: (code) => {
    const obj = {
      valid: false,
      statusCode: 200
    }
    for (var key in __constants.RESPONSE_MESSAGES) {
      if (__constants.RESPONSE_MESSAGES[key].code === code) {
        obj.valid = true
        obj.statusCode = __constants.RESPONSE_MESSAGES[key].status_code
        break
      }
    }
    return obj
  }
}
