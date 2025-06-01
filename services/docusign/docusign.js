const { OpenAI } = require("openai");
const docusign = require("docusign-esign");
const db = require("../../queries/mails/mails_queries");
const { pool } = require("../../lib/db/postgres");

class ContractService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.docusignClient = new docusign.ApiClient();
    this.docusignClient.setOAuthBasePath("account-d.docusign.com");
  }

  async generateAndSendContract(transcript, creatorId) {
    console.log("[generateAndSendContract] Starting contract generation");
    try {
      const contractData = await this.extractContractDetails(transcript);
      console.log("[generateAndSendContract] Extracted contract details:", contractData);

      const html = this.fillContractTemplate(contractData);
      console.log("[generateAndSendContract] Contract HTML template filled");

      const insertResult = await db.insertContract({
        creatorId,
        brandName: contractData.brandName || "",
        creatorName: contractData.creatorName || "",
        email: contractData.email || "",
        deliverables: contractData.deliverables || "",
        timeline: contractData.timeline || "",
        platforms: contractData.platforms || "",
        paymentAmount: contractData.paymentAmount || "",
        docusign_envelope_id: "", // initially empty
      });

      const contractId = insertResult.rows[0].id;
      const envelope = await this.sendViaDocuSign(
        { email: contractData.email, name: contractData.creatorName },
        html,
        contractId
      );
      console.log("[generateAndSendContract] Envelope sent via DocuSign:", envelope);

      return envelope;
    } catch (err) {
      console.error("[generateAndSendContract] Error:", err);
      throw err;
    }
  }

  async extractContractDetails(transcript) {
    console.log("[extractContractDetails] Sending transcript to OpenAI for extraction");

    const prompt = `
Extract the following fields from this transcript in the format "Field: Value" (each on a new line):
- Creator name
- Email
- Deliverables
- Timeline
- Platforms
- Payment amount
- Brand name

Transcript:
"""${transcript}"""
`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
    });

    console.log("[extractContractDetails] OpenAI response received");
    const extractedData = this.parseGPTOutput(response.choices[0].message.content);
    console.log("[extractContractDetails] Parsed GPT output:", extractedData);
    return extractedData;
  }

  parseGPTOutput(text) {
    console.log("[parseGPTOutput] Parsing GPT output");
    const lines = text.split("\n").filter(line => line.includes(":"));
    const result = {};

    for (let line of lines) {
      const [rawKey, ...rest] = line.split(":");
      const key = this.camelCase(rawKey.trim().toLowerCase());
      const value = rest.join(":").trim();
      result[key] = value;
    }

    return {
      creatorName: result.creatorName || "",
      email: result.email || "",
      deliverables: result.deliverables || "",
      timeline: result.timeline || "",
      platforms: result.platforms || "",
      paymentAmount: result.paymentAmount || "",
      brandName: result.brandName || "",
    };
  }

  camelCase(str) {
    return str
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(" ")
      .map((word, i) =>
        i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)
      )
      .join("");
  }

  fillContractTemplate(data) {
    console.log("[fillContractTemplate] Filling contract template with data:", data);
    return `
      <html>
        <body>
          <h1>Creator Agreement</h1>
          <p>This contract is between <b>${data.brandName}</b> and <b>${data.creatorName}</b>.</p>
          <p>Email: ${data.email}</p>
          <p>Deliverables: ${data.deliverables}</p>
          <p>Timeline: ${data.timeline}</p>
          <p>Platforms: ${data.platforms}</p>
          <p>Payment: ₹${data.paymentAmount}</p>
          <br><br>
          <p>Please sign below to confirm.</p>
        </body>
      </html>
    `;
  }

  async getDocuSignAuth() {
    const results = await this.docusignClient.requestJWTUserToken(
      process.env.DOCUSIGN_CLIENT_ID,
      process.env.DOCUSIGN_USER_ID,
      ['signature'],
      Buffer.from(process.env.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, '\n')),
      3600
    );
    const accessToken = results.body.access_token;
    const userInfo = await this.docusignClient.getUserInfo(accessToken);

    const accountId = userInfo.accounts[0].accountId;
    const baseUri = userInfo.accounts[0].baseUri + '/restapi';

    this.docusignClient.setBasePath(baseUri);
    this.docusignClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    return { accessToken, accountId, baseUri };
  }

  async sendViaDocuSign(recipient, html, contractId) {
    console.log('[sendViaDocuSign] Sending to:', recipient);
    const { accountId } = await this.getDocuSignAuth();
    const envelopesApi = new docusign.EnvelopesApi(this.docusignClient);

    const documentBase64 = Buffer.from(html).toString('base64');
    const document = docusign.Document.constructFromObject({
      documentBase64,
      name: 'Creator Contract',
      fileExtension: 'html',
      documentId: '1',
    });

    const signer = docusign.Signer.constructFromObject({
      email: recipient.email,
      name: recipient.name,
      recipientId: '1',
      routingOrder: '1',
      tabs: docusign.Tabs.constructFromObject({
        signHereTabs: [
          docusign.SignHere.constructFromObject({
            anchorString: 'Please sign below to confirm.',
            anchorYOffset: '-30',
            anchorUnits: 'pixels',
            anchorXOffset: '0',
          }),
        ],
      }),
    });

    const envelopeDefinition = new docusign.EnvelopeDefinition();
    envelopeDefinition.emailSubject = 'Please sign your creator contract';
    envelopeDefinition.documents = [document];
    envelopeDefinition.recipients = docusign.Recipients.constructFromObject({ signers: [signer] });
    envelopeDefinition.status = 'sent';

    const envelopeSummary = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition,
    });

    await pool.query(
      `UPDATE contracts SET docusign_envelope_id = $1 WHERE id = $2`,
      [envelopeSummary.envelopeId, contractId]
    );

    console.log('[sendViaDocuSign] Envelope sent. EnvelopeId:', envelopeSummary.envelopeId);
    return envelopeSummary;
  }

  async checkSignatureStatus(envelopeId) {
    const { accountId } = await this.getDocuSignAuth();
    const envelopesApi = new docusign.EnvelopesApi(this.docusignClient);

    const envelope = await envelopesApi.getEnvelope(accountId, envelopeId);
    console.log('[checkSignatureStatus] Envelope status:', envelope.status);
    return envelope.status;
  }
}

module.exports = ContractService;