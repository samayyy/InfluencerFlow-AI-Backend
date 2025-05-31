const ObjectID = require('mongodb').ObjectID

class UiqueIdGenerator {
  intId () {
    return parseInt((new Date().getTime()).toString() + (Math.floor(Math.random() * 9) + 10))
  }

  mongoId () {
    return ObjectID().toString()
  }

  randomInt (lenght) {
    return Math.floor(Math.random() * (9 * Math.pow(10, lenght - 1))) + Math.pow(10, lenght - 1)
  }
}
module.exports = UiqueIdGenerator
