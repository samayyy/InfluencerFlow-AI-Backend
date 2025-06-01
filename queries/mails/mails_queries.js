// mails_queries.js
const { pool } = require("../../lib/db/postgres");

const queries = {
  getAllCreators: async (id) => {
    return await pool.query("SELECT * FROM creators WHERE id = $1", [id]);
  },

  insertContract: async ({
    creatorId,
    brandName,
    creatorName,
    email,
    deliverables,
    timeline,
    platforms,
    paymentAmount,
    docusign_envelope_id,
  }) => {
    return await pool.query(
      `INSERT INTO contracts (
        creator_id, brand_name, creator_name, email,
        deliverables, timeline, platforms, payment_amount,
        docusign_envelope_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        creatorId,
        brandName || "",
        creatorName || "",
        email || "",
        deliverables || "",
        timeline || "",
        platforms || "",
        paymentAmount || "",
        docusign_envelope_id,
      ]
    );
  },

  /** 👇 Add this function to fetch pending contracts */
  getPendingContracts: async () => {
    const result = await pool.query(
      "SELECT * FROM contracts WHERE status = 'sent' AND docusign_envelope_id IS NOT NULL"
    );
    return result.rows;
  },

  updateContractStatus: async (id, status) => {
    await pool.query("UPDATE contracts SET status = $1 WHERE id = $2", [
      status,
      id,
    ]);
  },
};

module.exports = queries;