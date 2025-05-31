const mongoose = require('mongoose');
const __constants = require('./../../config/constants')
const __config = require('../../config')


class MongoDb { // Singleton
  connection = mongoose.connection;

  constructor() {
    try {
      this.connection
        .on('open', console.info.bind(console, 'Database connection: open'))
        .on('close', console.info.bind(console, 'Database connection: close'))
        .on('disconnected', function () {
          console.log('Database Connection disconnected ');
        })
        .on('reconnected', console.info.bind(console, 'Database connection: reconnected'))
        .on('fullsetup', console.info.bind(console, 'Database connection: fullsetup'))
        .on('error', function (err) {
          console.log('Database Connection error::', err);
          console.log('connection to mongo failed ' + err);
        })
    } catch (error) {
      console.log('Error in mongo db on connect :: ', error)
    }
  }

  async connect() {
    if (__config.mongo.init) {
      try {
        console.log('DATA BASE::: ', __config.mongo.mongourl);
        mongoose.set('strictQuery', false)
        await mongoose.connect(__config.mongo.mongourl,
          {
            useNewUrlParser: true,
            useUnifiedTopology: true
          }
        )
        console.log('Mongodb connected');
      } catch (error) {
        console.log('Mongo db error in connect function ::', error);
      }
    } else {
      console.log('Mongodb not initialized');

    }
  }

  async close() {
    if (__config.mongo.init) {
      try {
        return await this.connection.close(false);
      } catch (error) {
        console.log('Mongo db error while close function ::', error);
      }
    }
  }
}

module.exports = new MongoDb();