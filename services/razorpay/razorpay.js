const axios = require('axios')
const __constants = require('../../config/constants')
const mockRazorpayService = require('./mockRazorpay')

class RazorpayService {
  constructor () {
    this.useMock = __constants.MOCK_CONFIG.USE_MOCK

    if (this.useMock) {
      console.log('🔧 Using Mock Razorpay Service for Development')
      this.mockService = mockRazorpayService
    } else {
      console.log('🔗 Using Live Razorpay API')
      this.client = axios.create({
        baseURL: __constants.RAZORPAY_CONFIG.BASE_URL,
        auth: {
          username: process.env.RAZORPAY_KEY_ID,
          password: process.env.RAZORPAY_KEY_SECRET
        },
        headers: {
          'Content-Type': 'application/json'
        }
      })

      // Add response interceptor for error handling
      this.client.interceptors.response.use(
        (response) => response,
        (error) => {
          console.log('Razorpay API Error:', error.response?.data || error.message)
          throw error
        }
      )
    }
  }

  // Contact Management Methods
  async createContact (contactData) {
    if (this.useMock) {
      return await this.mockService.createContact(contactData)
    }

    try {
      const response = await this.client.post('/contacts', contactData)
      return response.data
    } catch (err) {
      console.log('Error in createContact function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async getContactById (contactId) {
    if (this.useMock) {
      return await this.mockService.getContactById(contactId)
    }

    try {
      const response = await this.client.get(`/contacts/${contactId}`)
      return response.data
    } catch (err) {
      console.log('Error in getContactById function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async updateContactById (contactId, updateData) {
    if (this.useMock) {
      return await this.mockService.updateContactById(contactId, updateData)
    }

    try {
      const response = await this.client.patch(`/contacts/${contactId}`, updateData)
      return response.data
    } catch (err) {
      console.log('Error in updateContactById function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async getAllContacts (count = 10, skip = 0) {
    if (this.useMock) {
      return await this.mockService.getAllContacts(count, skip)
    }

    try {
      const response = await this.client.get('/contacts', {
        params: { count, skip }
      })
      return response.data
    } catch (err) {
      console.log('Error in getAllContacts function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  // Fund Account Management Methods
  async createFundAccount (fundAccountData) {
    if (this.useMock) {
      return await this.mockService.createFundAccount(fundAccountData)
    }

    try {
      const response = await this.client.post('/fund_accounts', fundAccountData)
      return response.data
    } catch (err) {
      console.log('Error in createFundAccount function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async getFundAccountById (fundAccountId) {
    if (this.useMock) {
      return await this.mockService.getFundAccountById(fundAccountId)
    }

    try {
      const response = await this.client.get(`/fund_accounts/${fundAccountId}`)
      return response.data
    } catch (err) {
      console.log('Error in getFundAccountById function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async getAllFundAccounts (contactId, count = 10, skip = 0) {
    if (this.useMock) {
      return await this.mockService.getAllFundAccounts(contactId, count, skip)
    }

    try {
      const params = { count, skip }
      if (contactId) params.contact_id = contactId

      const response = await this.client.get('/fund_accounts', { params })
      return response.data
    } catch (err) {
      console.log('Error in getAllFundAccounts function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  // Payout Management Methods
  async createPayout (payoutData) {
    if (this.useMock) {
      return await this.mockService.createPayout(payoutData)
    }

    try {
      // Add account_number if not provided
      if (!payoutData.account_number) {
        payoutData.account_number = process.env.RAZORPAYX_ACCOUNT_NUMBER
      }

      const response = await this.client.post('/payouts', payoutData)
      return response.data
    } catch (err) {
      console.log('Error in createPayout function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async getPayoutById (payoutId) {
    if (this.useMock) {
      return await this.mockService.getPayoutById(payoutId)
    }

    try {
      const response = await this.client.get(`/payouts/${payoutId}`)
      return response.data
    } catch (err) {
      console.log('Error in getPayoutById function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async cancelPayoutById (payoutId) {
    if (this.useMock) {
      return await this.mockService.cancelPayoutById(payoutId)
    }

    try {
      const response = await this.client.post(`/payouts/${payoutId}/cancel`)
      return response.data
    } catch (err) {
      console.log('Error in cancelPayoutById function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  async getAllPayouts (count = 10, skip = 0, contactId) {
    if (this.useMock) {
      return await this.mockService.getAllPayouts(count, skip, contactId)
    }

    try {
      const params = { count, skip }
      if (contactId) params.contact_id = contactId

      const response = await this.client.get('/payouts', { params })
      return response.data
    } catch (err) {
      console.log('Error in getAllPayouts function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  // Balance Management Methods
  async getAccountBalance () {
    if (this.useMock) {
      return await this.mockService.getAccountBalance()
    }

    try {
      const response = await this.client.get('/balance')
      return response.data
    } catch (err) {
      console.log('Error in getAccountBalance function :: err', err)
      throw new Error(err.response?.data?.error?.description || err.message)
    }
  }

  // Mock-specific methods (only available in mock mode)
  async addFundsToAccount (amount) {
    if (this.useMock) {
      return await this.mockService.addFundsToAccount(amount)
    }
    throw new Error('addFundsToAccount is only available in mock mode')
  }

  async resetMockData () {
    if (this.useMock) {
      return await this.mockService.resetMockData()
    }
    throw new Error('resetMockData is only available in mock mode')
  }

  getStats () {
    if (this.useMock) {
      return this.mockService.getStats()
    }
    throw new Error('getStats is only available in mock mode')
  }
}

module.exports = new RazorpayService()
