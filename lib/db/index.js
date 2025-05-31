class Databases {
  constructor () {
    console.debug('databases constructor called.')
    // this.mongo = require('./mongo.js')
    // this.mysql = require('./mysql.js')
    this.redis = require('./redis_local.js')
    this.mongo = require('./mongo-mongoose.js')
  }

  async init () {
    try {
      await this.redis.init()
      await this.mongo.connect()
      return 'connections open.'
    } catch (err) {
      console.log('error while doing database init', err)
      throw err
    }
  }

  async close () {
    await this.redis.close()
    await this.mongo.close()
    return 'connection closed.'
  }
}

module.exports = new Databases()