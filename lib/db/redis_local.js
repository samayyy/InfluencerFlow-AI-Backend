
const redis = require('redis')
const __config = require('../../config')
const redis_lib = require('../util/redis_lib')
class redisLib extends redis_lib {
  
  init () {
    return new Promise((resolve, reject) => {
      let vm = this
      if (!__config.redis_local.init) {
        this.connection = null
       console.log('redisLib.init redis not initialized.')
        resolve('redis not initialized')
        return
      }
     console.debug('redisLib.init, initializing redis connection ', { port: __config.redis_local.port, host: __config.redis_local.host, uri: __config.redis_local.uri })
      let redisClient = redis.createClient(__config.redis_local)// (__config.redis_local.port, __config.redis_local.host, {});
      redisClient.on('error',  (err) => {
        console.debug('redisLib.init, error in redis connection ', { port: __config.redis_local.port, host: __config.redis_local.host, err: err })
        vm.connection = null
        if (vm.connection_status == false) { reject('redis error') } else { process.exit(1) }
      })
      redisClient.on('connect', () => {
        console.log('redisLib.init, success redis connection ', { port: __config.redis_local.port, host: __config.redis_local.host })
        vm.connection = redisClient
        vm.connection_status = true
        resolve('redis connected')
      })
    })
  }

  close () {
    return new Promise((resolve, reject) => {
      if (__config.redis_local.init) {
        console.log('redisLib.close, function called', { port: __config.redis_local.port, host: __config.redis_local.host })
        this.connection.quit()
        this.connection_status = false
        resolve(null)
      } else {
        resolve(null)
      }
    })
  }
}
module.exports = new redisLib()
