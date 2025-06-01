const __constants = require('../../config/constants')

class MockRazorpayService {
  constructor () {
    this.contacts = new Map()
    this.fundAccounts = new Map()
    this.payouts = new Map()
    this.balance = {
      balance: 500000, // ₹5000 in paise
      currency: 'INR',
      account_number: __constants.MOCK_CONFIG.MOCK_ACCOUNT_NUMBER
    }

    console.log('🔧 MockRazorpayService initialized - Development Mode')
  }

  // Utility methods
  generateId (prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async simulateDelay () {
    await new Promise(resolve => setTimeout(resolve, __constants.MOCK_CONFIG.MOCK_DELAY))
  }

  simulateRandomFailure () {
    if (Math.random() < __constants.MOCK_CONFIG.FAILURE_RATE) {
      throw new Error('Mock API: Simulated random failure for testing')
    }
  }

  validateIFSC (ifsc) {
    const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/
    return ifscPattern.test(ifsc)
  }

  validateAccountNumber (accountNumber) {
    const accountPattern = /^[0-9]{9,18}$/
    return accountPattern.test(accountNumber)
  }

  validateVPA (vpa) {
    const vpaPattern = /^[\w.-]+@[\w.-]+$/
    return vpaPattern.test(vpa)
  }

  // Contact Management Methods
  async createContact (contactData) {
    try {
      await this.simulateDelay()
      this.simulateRandomFailure()

      if (!contactData.name || !contactData.type) {
        throw new Error('Name and type are required fields')
      }

      if (!__constants.RAZORPAY_CONFIG.CONTACT_TYPES.includes(contactData.type)) {
        throw new Error('Invalid contact type')
      }

      const contact = {
        id: this.generateId('cont'),
        entity: 'contact',
        name: contactData.name,
        email: contactData.email || null,
        contact: contactData.contact || null,
        type: contactData.type,
        reference_id: contactData.reference_id || null,
        notes: contactData.notes || {},
        active: true,
        created_at: Math.floor(Date.now() / 1000)
      }

      this.contacts.set(contact.id, contact)
      console.log(`📝 Mock Contact Created: ${contact.id}`)
      return contact
    } catch (err) {
      console.log('Error in createContact function :: err', err)
      throw new Error(err.message)
    }
  }

  async getContactById (contactId) {
    try {
      await this.simulateDelay()

      const contact = this.contacts.get(contactId)
      if (!contact) {
        throw new Error('Contact not found')
      }

      console.log(`📖 Mock Contact Retrieved: ${contactId}`)
      return contact
    } catch (err) {
      console.log('Error in getContactById function :: err', err)
      throw new Error(err.message)
    }
  }

  async updateContactById (contactId, updateData) {
    try {
      await this.simulateDelay()

      const contact = this.contacts.get(contactId)
      if (!contact) {
        throw new Error('Contact not found')
      }

      const updatedContact = {
        ...contact,
        ...updateData,
        updated_at: Math.floor(Date.now() / 1000)
      }

      this.contacts.set(contactId, updatedContact)
      console.log(`✏️ Mock Contact Updated: ${contactId}`)
      return updatedContact
    } catch (err) {
      console.log('Error in updateContactById function :: err', err)
      throw new Error(err.message)
    }
  }

  async getAllContacts (count = 10, skip = 0) {
    try {
      await this.simulateDelay()

      const allContacts = Array.from(this.contacts.values())
      const paginatedContacts = allContacts.slice(skip, skip + count)

      console.log(`📋 Mock Contacts Listed: ${paginatedContacts.length} of ${allContacts.length}`)
      return {
        entity: 'collection',
        count: paginatedContacts.length,
        items: paginatedContacts
      }
    } catch (err) {
      console.log('Error in getAllContacts function :: err', err)
      throw new Error(err.message)
    }
  }

  // Fund Account Management Methods
  async createFundAccount (fundAccountData) {
    try {
      await this.simulateDelay()
      this.simulateRandomFailure()

      if (!fundAccountData.contact_id || !fundAccountData.account_type) {
        throw new Error('Contact ID and account type are required')
      }

      if (!this.contacts.has(fundAccountData.contact_id)) {
        throw new Error('Contact not found')
      }

      if (!__constants.RAZORPAY_CONFIG.ACCOUNT_TYPES.includes(fundAccountData.account_type)) {
        throw new Error('Invalid account type')
      }

      // Validate based on account type
      if (fundAccountData.account_type === 'bank_account') {
        const bankAccount = fundAccountData.bank_account
        if (!bankAccount || !bankAccount.name || !bankAccount.ifsc || !bankAccount.account_number) {
          throw new Error('Bank account details are incomplete')
        }
        if (!this.validateIFSC(bankAccount.ifsc)) {
          throw new Error('Invalid IFSC code')
        }
        if (!this.validateAccountNumber(bankAccount.account_number)) {
          throw new Error('Invalid account number')
        }
      }

      if (fundAccountData.account_type === 'vpa') {
        const vpa = fundAccountData.vpa
        if (!vpa || !vpa.address) {
          throw new Error('VPA address is required')
        }
        if (!this.validateVPA(vpa.address)) {
          throw new Error('Invalid VPA address format')
        }
      }

      const fundAccount = {
        id: this.generateId('fa'),
        entity: 'fund_account',
        contact_id: fundAccountData.contact_id,
        account_type: fundAccountData.account_type,
        bank_account: fundAccountData.bank_account || null,
        vpa: fundAccountData.vpa || null,
        wallet: fundAccountData.wallet || null,
        active: true,
        created_at: Math.floor(Date.now() / 1000)
      }

      this.fundAccounts.set(fundAccount.id, fundAccount)
      console.log(`🏦 Mock Fund Account Created: ${fundAccount.id}`)
      return fundAccount
    } catch (err) {
      console.log('Error in createFundAccount function :: err', err)
      throw new Error(err.message)
    }
  }

  async getFundAccountById (fundAccountId) {
    try {
      await this.simulateDelay()

      const fundAccount = this.fundAccounts.get(fundAccountId)
      if (!fundAccount) {
        throw new Error('Fund account not found')
      }

      console.log(`🏦 Mock Fund Account Retrieved: ${fundAccountId}`)
      return fundAccount
    } catch (err) {
      console.log('Error in getFundAccountById function :: err', err)
      throw new Error(err.message)
    }
  }

  async getAllFundAccounts (contactId, count = 10, skip = 0) {
    try {
      await this.simulateDelay()

      let allFundAccounts = Array.from(this.fundAccounts.values())

      if (contactId) {
        allFundAccounts = allFundAccounts.filter(fa => fa.contact_id === contactId)
      }

      const paginatedFundAccounts = allFundAccounts.slice(skip, skip + count)

      console.log(`🏦 Mock Fund Accounts Listed: ${paginatedFundAccounts.length} of ${allFundAccounts.length}`)
      return {
        entity: 'collection',
        count: paginatedFundAccounts.length,
        items: paginatedFundAccounts
      }
    } catch (err) {
      console.log('Error in getAllFundAccounts function :: err', err)
      throw new Error(err.message)
    }
  }

  // Payout Management Methods
  async createPayout (payoutData) {
    try {
      await this.simulateDelay()
      this.simulateRandomFailure()

      // Validate required fields
      if (!payoutData.fund_account_id || !payoutData.amount || !payoutData.currency || !payoutData.mode || !payoutData.purpose) {
        throw new Error('Missing required fields: fund_account_id, amount, currency, mode, purpose')
      }

      // Check if fund account exists
      //   if (!this.fundAccounts.has(payoutData.fund_account_id)) {
      //     throw new Error('Fund account not found')
      //   }

      // Validate amount
      if (payoutData.amount < 100) {
        throw new Error('Minimum amount is ₹1 (100 paise)')
      }

      // Validate currency
      if (payoutData.currency !== 'INR') {
        throw new Error('Only INR currency is supported')
      }

      // Validate mode
      if (!__constants.RAZORPAY_CONFIG.TRANSFER_MODES.includes(payoutData.mode)) {
        throw new Error('Invalid transfer mode')
      }

      // Check balance
      if (this.balance.balance < payoutData.amount) {
        if (!payoutData.queue_if_low_balance) {
          throw new Error('Insufficient balance. Add queue_if_low_balance: true to queue the payout')
        }
      }

      // Determine initial status
      let status = 'processing'
      if (this.balance.balance < payoutData.amount && payoutData.queue_if_low_balance) {
        status = 'queued'
      }

      const payout = {
        id: this.generateId('pout'),
        entity: 'payout',
        fund_account_id: payoutData.fund_account_id,
        amount: payoutData.amount,
        currency: payoutData.currency,
        mode: payoutData.mode,
        purpose: payoutData.purpose,
        status: status,
        account_number: __constants.MOCK_CONFIG.MOCK_ACCOUNT_NUMBER,
        utr: status === 'processing' ? this.generateId('UTR') : null,
        reference_id: payoutData.reference_id || null,
        narration: payoutData.narration || null,
        notes: payoutData.notes || {},
        fees: Math.floor(payoutData.amount * 0.02), // 2% mock fee
        tax: Math.floor(payoutData.amount * 0.0036), // 18% GST on fees
        created_at: Math.floor(Date.now() / 1000),
        queue_if_low_balance: payoutData.queue_if_low_balance || false
      }

      // Deduct from balance if not queued
      if (status === 'processing') {
        this.balance.balance -= (payoutData.amount + payout.fees + payout.tax)
      }

      this.payouts.set(payout.id, payout)
      console.log(`💸 Mock Payout Created: ${payout.id} - Status: ${status}`)

      // Simulate status progression for processed payouts
      if (status === 'processing') {
        setTimeout(() => {
          payout.status = 'processed'
          payout.processed_at = Math.floor(Date.now() / 1000)
          console.log(`✅ Mock Payout Processed: ${payout.id}`)
        }, 3000)
      }

      return payout
    } catch (err) {
      console.log('Error in createPayout function :: err', err)
      throw new Error(err.message)
    }
  }

  async getPayoutById (payoutId) {
    try {
      await this.simulateDelay()

      const payout = this.payouts.get(payoutId)
      if (!payout) {
        throw new Error('Payout not found')
      }

      console.log(`💸 Mock Payout Retrieved: ${payoutId}`)
      return payout
    } catch (err) {
      console.log('Error in getPayoutById function :: err', err)
      throw new Error(err.message)
    }
  }

  async cancelPayoutById (payoutId) {
    try {
      await this.simulateDelay()

      const payout = this.payouts.get(payoutId)
      if (!payout) {
        throw new Error('Payout not found')
      }

      if (!['queued', 'processing'].includes(payout.status)) {
        throw new Error(`Cannot cancel payout in ${payout.status} status`)
      }

      payout.status = 'cancelled'
      payout.cancelled_at = Math.floor(Date.now() / 1000)

      // Refund amount to balance if it was deducted
      if (payout.status === 'processing') {
        this.balance.balance += (payout.amount + payout.fees + payout.tax)
      }

      console.log(`❌ Mock Payout Cancelled: ${payoutId}`)
      return payout
    } catch (err) {
      console.log('Error in cancelPayoutById function :: err', err)
      throw new Error(err.message)
    }
  }

  async getAllPayouts (count = 10, skip = 0, contactId) {
    try {
      await this.simulateDelay()

      let allPayouts = Array.from(this.payouts.values())

      if (contactId) {
        // Filter by contact_id through fund_account
        const contactFundAccounts = Array.from(this.fundAccounts.values())
          .filter(fa => fa.contact_id === contactId)
          .map(fa => fa.id)

        allPayouts = allPayouts.filter(payout =>
          contactFundAccounts.includes(payout.fund_account_id)
        )
      }

      // Sort by created_at desc
      allPayouts.sort((a, b) => b.created_at - a.created_at)

      const paginatedPayouts = allPayouts.slice(skip, skip + count)

      console.log(`💸 Mock Payouts Listed: ${paginatedPayouts.length} of ${allPayouts.length}`)
      return {
        entity: 'collection',
        count: paginatedPayouts.length,
        items: paginatedPayouts
      }
    } catch (err) {
      console.log('Error in getAllPayouts function :: err', err)
      throw new Error(err.message)
    }
  }

  // Balance Management Methods
  async getAccountBalance () {
    try {
      await this.simulateDelay()

      console.log(`💰 Mock Balance Retrieved: ₹${this.balance.balance / 100}`)
      return this.balance
    } catch (err) {
      console.log('Error in getAccountBalance function :: err', err)
      throw new Error(err.message)
    }
  }

  // Utility methods for testing
  async addFundsToAccount (amount) {
    this.balance.balance += amount
    console.log(`💰 Mock Funds Added: ₹${amount / 100} - New Balance: ₹${this.balance.balance / 100}`)
    return this.balance
  }

  async resetMockData () {
    this.contacts.clear()
    this.fundAccounts.clear()
    this.payouts.clear()
    this.balance.balance = 500000
    console.log('🔄 Mock Data Reset')
  }

  getStats () {
    return {
      contacts: this.contacts.size,
      fundAccounts: this.fundAccounts.size,
      payouts: this.payouts.size,
      balance: this.balance.balance
    }
  }
}

module.exports = new MockRazorpayService()
