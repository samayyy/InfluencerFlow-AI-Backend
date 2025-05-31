const UserActivityLogs = require('../services/userActivityLogs/userActivityLogsService')

const userActivityLogMiddleware = (req, body) => {
  try {
    const formedJson = {}
    formedJson.params = req.params
    formedJson.query = req.query
    formedJson.requestBody = req.body
    formedJson.method = req.method
    formedJson.path = req.originalUrl
    formedJson.headers = req.headers
    formedJson.responseBody = body
    //  UserActivityLogs.userActivitySaveToMongo(formedJson)
    UserActivityLogs.userActivitySaveToElastic(formedJson)
    return 1
  } catch (e) {
    console.debug('userActivityLogMiddleware >>>>>>>> error in try catch :: ', e)
    return 1
  }
}

const userActivityLog = (req, res, next) => { req.logUserActivities = true; next() }

module.exports = { userActivityLogMiddleware, userActivityLog }
