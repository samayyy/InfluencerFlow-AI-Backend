const AuditLogs = require('../../mongooseSchema/AuditLogs')
const client = require('./../../lib/db/elastic')
const __constants = require('./../../config/constants')

class UserActivityLogs {
  userActivitySaveToMongo (body) {
    try {
      const auditlogs = new AuditLogs(body)
      auditlogs.save() // when fail its goes to catch
    } catch (err) {
      console.log('Error in userActivitySave function while inserting into mongo database :: ', err)
      throw new Error(err)
    }
  }

  async userActivitySaveToElastic (body) {
    try {
      client.index({ index: __constants.USER_ACTIVITY_LOGS, document: body })
      // await client.indices.refresh({ index: __constants.USER_ACTIVITY_LOGS })
    } catch (err) {
      console.log('Error in userActivitySaveToElastic function while inserting into elastic  :: ', err)
      throw new Error(err)
    }
  }
}

module.exports = new UserActivityLogs()
