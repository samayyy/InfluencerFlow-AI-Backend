const { pool } = require('../../lib/db/postgres')

const queries = {
  getAllCreators: async (id) => {
    return await pool.query('SELECT * FROM creators WHERE id = $1', [id])
  }
}

module.exports = queries
