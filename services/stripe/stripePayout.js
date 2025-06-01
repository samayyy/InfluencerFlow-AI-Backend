const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

class StripeService {
  /**
   * Create a Stripe Express account
   * @param {Object} accountData - Account creation data
   * @returns {Object} Created account object
   */
  async createAccount(accountData) {
    try {
      const account = await stripe.accounts.create({
        type: accountData.type,
        country: accountData.country,
        email: accountData.email,
        business_type: accountData.business_type,
        individual: accountData.individual,
        business_profile: accountData.business_profile
      })
      return account
    } catch (err) {
      console.log('Error in createAccount function :: err', err)
      throw new Error(err.message || 'Failed to create Stripe account')
    }
  }

  /**
   * Add external account (bank account/card) to Stripe account
   * @param {string} accountId - Stripe account ID
   * @param {string} externalAccountToken - Bank account or card token
   * @returns {Object} External account object
   */
  async addExternalAccount(accountId, externalAccountToken) {
    try {
      const externalAccount = await stripe.accounts.createExternalAccount(
        accountId,
        {
          external_account: externalAccountToken
        }
      )
      return externalAccount
    } catch (err) {
      console.log('Error in addExternalAccount function :: err', err)
      throw new Error(err.message || 'Failed to add external account')
    }
  }

  /**
   * Create account link for onboarding
   * @param {Object} linkData - Account link data
   * @returns {Object} Account link object
   */
  async createAccountLink(linkData) {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: linkData.account,
        refresh_url: linkData.refresh_url,
        return_url: linkData.return_url,
        type: linkData.type
      })
      return accountLink
    } catch (err) {
      console.log('Error in createAccountLink function :: err', err)
      throw new Error(err.message || 'Failed to create account link')
    }
  }

  /**
   * Get account details
   * @param {string} accountId - Stripe account ID
   * @returns {Object} Account object
   */
  async getAccount(accountId) {
    try {
      const account = await stripe.accounts.retrieve(accountId)
      return account
    } catch (err) {
      console.log('Error in getAccount function :: err', err)
      throw new Error(err.message || 'Failed to retrieve account')
    }
  }

  /**
   * Update account information
   * @param {string} accountId - Stripe account ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated account object
   */
  async updateAccount(accountId, updateData) {
    try {
      const account = await stripe.accounts.update(accountId, updateData)
      return account
    } catch (err) {
      console.log('Error in updateAccount function :: err', err)
      throw new Error(err.message || 'Failed to update account')
    }
  }

  /**
   * Delete/close account
   * @param {string} accountId - Stripe account ID
   * @returns {Object} Deletion confirmation
   */
  async deleteAccount(accountId) {
    try {
      const deleted = await stripe.accounts.del(accountId)
      return deleted
    } catch (err) {
      console.log('Error in deleteAccount function :: err', err)
      throw new Error(err.message || 'Failed to delete account')
    }
  }

  /**
   * List external accounts for an account
   * @param {string} accountId - Stripe account ID
   * @returns {Object} List of external accounts
   */
  async listExternalAccounts(accountId) {
    try {
      const externalAccounts = await stripe.accounts.listExternalAccounts(accountId)
      return externalAccounts
    } catch (err) {
      console.log('Error in listExternalAccounts function :: err', err)
      throw new Error(err.message || 'Failed to list external accounts')
    }
  }
}

module.exports = new StripeService()