const axios = require('axios')
const contractQueries = require('./queries/mails/mails_queries')
const ContractServiceClass = require('./services/docusign/docusign');
const contractService = new ContractServiceClass();const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID

async function pollContractStatus() {
  try {
    const { accessToken } = await contractService.getDocuSignAuth();

    const pendingContracts = await contractQueries.getPendingContracts();

    for (const contract of pendingContracts) {
      const envelopeId = contract.docusign_envelope_id;

      try {
        const { data } = await axios.get(
          `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (data.status === 'completed') {
          await contractQueries.updateContractStatus(contract.id, 'signed');
          console.log(`✅ Contract ${contract.id} signed.`);
        }
      } catch (err) {
        console.error(`❌ Error checking status for contract ${contract.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Failed to get DocuSign token:', err.message);
  }
}

module.exports = pollContractStatus