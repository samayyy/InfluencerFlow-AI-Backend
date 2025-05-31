const __constants = require('./../../config/constants')
const vault = require("node-vault")({ apiVersion: __constants.V1, endpoint: process.env.VAULT_ENDPOINT });

const run = async () => {
	try {
		const result = await vault.approleLogin({ role_id: process.env.VAULT_ROLE_ID, secret_id: process.env.VAULT_SECRET_ID })
		vault.token = await result.auth.client_token;
		const { data } = await vault.read(process.env.VAULT_PATH)
		for (let key in data.data) { process.env[key] = data.data[key] }
		return true
	} catch (err) {
		console.log('\x1b[31m Error :: \nError in Vault ::\n', err)
		throw Error('Please add the valid Vault credentials to proceed')
	}
}

module.exports = {
	run
}