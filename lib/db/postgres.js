const { Pool, types } = require("pg");
const __config = require("../../config");

types.setTypeParser(1700, (val) => parseFloat(val));

class Postgres {
  constructor() {
    if (__config.postgres.init) {
      this.pool = new Pool({
        user: __config.postgres.user,
        host: __config.postgres.host,
        database: __config.postgres.database,
        password: __config.postgres.password,
        port: __config.postgres.port,
        ssl: { rejectUnauthorized: false },
      });
    }
  }

  async connect() {
    if (__config.postgres.init) {
      try {
        await this.pool.connect();
        console.log("Connected to the postgres database");
      } catch (error) {
        throw "Error connecting to the postgres database ::";
      }
    }
  }

  async close() {
    if (__config.postgres.init) {
      try {
        await this.pool.end();
        console.log("Connection closed of postgres");
      } catch (error) {
        console.error("Error closing postgres connection", error);
      }
    }
  }
}

module.exports = new Postgres();
