const _ = require('lodash')

class TrimService {
  singleInputTrim (input) {
    Object.keys(input).map(k => {
      input[k] = typeof input[k] === 'string' ? input[k].trim() : input[k]
    })
    return input
  }

  bulkInputTrim (input) {
    _.each(input, singleJson => this.singleInputTrim(input))
    return input
  }
}

module.exports = TrimService
