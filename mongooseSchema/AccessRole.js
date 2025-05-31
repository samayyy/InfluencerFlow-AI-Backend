const mongoose = require('mongoose')
const Schema = mongoose.Schema
const timestamps = require('mongoose-timestamp-plugin')
const timestampsAppendObj = {
  createdName: 'createdAt', // default: 'createdAt'
  updatedName: 'updatedAt', // default: 'updatedAt'
  disableCreated: false, // Disables the logging of the creation date
  disableUpdated: false // Disabled the loggin of the modification date
}

const schema = new Schema({
  name: {
    type: String,
    unique: true
  },
  isActive: {
    type: Number,
    default: 1
  }
})
schema.plugin(timestamps, timestampsAppendObj)
module.exports = mongoose.model('AccessRole', schema)
