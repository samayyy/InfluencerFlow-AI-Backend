var redis = require('redis')

class redis_lib {
  constructor () {
    console.debug('redis_lib.constructor called.')
    this.connection = null
    this.connection_status = false
  }

  // Returns all keys matching pattern.
  getKeys (key_pattern) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.keys(key_pattern, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  // Returns if key exists.
  getKeyExists (key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.exists(key, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  get(key) {

    return new Promise((resolve, reject) => {
        if (this.connection) {
            try {
                this.connection.get(key, (error, result) => {
                    if (error) {
                        reject(error)
                    } else {
                        resolve(result)
                    }
                })
            } catch (eee) {}
        } else {
            reject(new Error('redis connection failed'))
        }
    })
}

  set (key, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.set(key, value, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  setex (key, value, expiry_sec) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.set(key, value, 'EX', expiry_sec, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  keep_ttl (key, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.set(key, value, 'KEEPTTL', (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  ex (key, expiry_sec) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.expire(key, expiry_sec, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  update (key, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        keyExists(key).then((isExist) => {
          if (isExist) { return set(key, value) }
          // this.connection.set(key, value, (error, result) => {
          //     if (error)
          //         reject(error);
          //     else
          //         resolve(result);
          // });
          else { reject(new Error('Key not exists.')) }
        }).catch((error) => {
          reject(error)
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  increment (key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.incr(key, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  incrementby (key, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.incrby(key, value, (error, result) => {
          if (error) { reject(error) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  hash_increment (hash, key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hincrby(hash, key, '1', (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  };

  hash_incrementby (hash, key, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hincrby(hash, key, value, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  hash_get (hash, key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hget(hash, key, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  hash_set (hash, key, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hset(hash, key, value, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    }); mget
  }

  hash_mget (hash, key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hmget(hash, key, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  hash_mset (hash, value) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hmset(hash, 'body', value, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  hash_delete (hash, key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hdel(hash, key, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  hash_getall (hash) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.hgetall(hash, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  set_add (key, member) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.sadd(key, member, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  set_delete (key, member) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.srem(key, member, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }

  key_delete (key) {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.del(key, (err, result) => {
          if (err) { reject(err) } else { resolve(result) }
        })
      } else {
        reject(new Error('redis connection failed'))
      }
    })
  }
}
module.exports = redis_lib
