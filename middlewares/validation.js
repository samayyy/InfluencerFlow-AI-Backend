const _ = require('lodash')
const Validator = require('jsonschema').Validator
const v = new Validator()
const __util = require('./../lib/util')
const __constants = require('./../config/constants')

module.exports = (req, res, next, schema, medium) => {
  if (!__constants.ARRAY_OF_MEDIUM.includes(medium)) { return res.status(400).send({ error: { message: 'Kindly assign the request medium for the request of API.' }, value: false }) }
  let request = req[medium]
  const formatedError = []
  v.addSchema(schema)
  const error = _.map(v.validate(request, schema).errors, 'stack')
  _.each(error, function (err) {
    const formatedErr = err.split('.')
    const patternErr = formatedErr[1] ? formatedErr[1].split('does not match pattern') : ''
    if (patternErr.length > 1) formatedError.push(patternErr[0] + 'is invalid')
    else formatedError.push(formatedErr[1] ? formatedErr[1] : formatedErr[0])
  })
  if (formatedError.length > 0) { return res.status(400).send({ error: { message: formatedError }, value: false }) } else { const trim = new __util.Trim(); request = trim.singleInputTrim(request); next() }
}
