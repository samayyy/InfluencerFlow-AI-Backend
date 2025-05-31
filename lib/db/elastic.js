const { Client } = require('@elastic/elasticsearch');
const __config = require('./../../config')
let client = {}
if (__config.elastic.trackUserActivtyLogs) {
  client = new Client({
    cloud: {
      id: __config.elastic.cloudId
    },
    auth: {
      username: __config.elastic.username,
      password: __config.elastic.password
    }
  });
}
module.exports = client;  