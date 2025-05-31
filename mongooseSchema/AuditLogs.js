const mongoose = require('mongoose')
const Schema = mongoose.Schema

const schema = new Schema({
  query: {
    type: Object
  },
  params: {
    type: Object
  },
  requestBody: {
    type: Object
  },
  method: {
    type: String
  },
  path: {
    type: String
  },
  headers: {
    type: Object
  },
  responseBody: {
    type: Object
  }
},
{ timestamps: true })
module.exports = mongoose.model('AuditLogs', schema)
