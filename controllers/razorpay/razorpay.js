// controllers/payoutController.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const razorpayService = require('../../services/razorpay/razorpay')

/**
 * @namespace -RAZORPAY-PAYOUT-MODULE-
 * @description API's related to RazorpayX Payout module (Mock/Live based on environment).
 */

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name createContact
 * @path {POST} /api/payout/createContact
 * @description Business Logic :- Create a new contact for payout operations
 */
const createContactValidationSchema = {
  name: { required: true, type: 'string' },
  email: { required: false, type: 'string', format: 'email' },
  contact: { required: false, type: 'string' },
  type: { required: true, type: 'string', enum: __constants.RAZORPAY_CONFIG.CONTACT_TYPES },
  reference_id: { required: false, type: 'string' },
  notes: { required: false, type: 'object' }
}

const createContactValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, createContactValidationSchema, 'body')
}

const createContact = async (req, res) => {
  try {
    console.log('hi')
    // const contactData = req.body
    const contactData = {
      name: req.body.name,
      email: req.body.email,
      contact: req.body.contact,
      type: req.body.type
    }
    console.log('>>', contactData)
    const response = await razorpayService.createContact(contactData)
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name createFundAccount
 * @path {POST} /api/payout/createFundAccount
 * @description Business Logic :- Create a new fund account for a contact
 */
const createFundAccountValidationSchema = {
  contact_id: { required: true, type: 'string' },
  account_type: { required: true, type: 'string', enum: __constants.RAZORPAY_CONFIG.ACCOUNT_TYPES }
}

const createFundAccountValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, createFundAccountValidationSchema, 'body')
}

const createFundAccount = async (req, res) => {
  try {
    const fundAccountData = req.body
    const response = await razorpayService.createFundAccount(fundAccountData)
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name createPayout
 * @path {POST} /api/payout/createPayout
 * @description Business Logic :- Create a new payout
 */
const createPayoutValidationSchema = {
  fund_account_id: { required: true, type: 'string' },
  amount: { required: true, type: 'number', min: 100 },
  currency: { required: true, type: 'string', enum: ['INR'] },
  mode: { required: true, type: 'string', enum: __constants.RAZORPAY_CONFIG.TRANSFER_MODES },
  purpose: { required: true, type: 'string' },
  queue_if_low_balance: { required: false, type: 'boolean' },
  reference_id: { required: false, type: 'string' },
  narration: { required: false, type: 'string' },
  notes: { required: false, type: 'object' }
}

const createPayoutValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, createPayoutValidationSchema, 'body')
}

const createPayout = async (req, res) => {
  try {
    const payoutData = req.body
    console.log('>>', payoutData)
    const response = await razorpayService.createPayout(payoutData)
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name getContact
 * @path {GET} /api/payout/getContact/:contactId
 * @description Business Logic :- Get contact details by contact ID
 */
const getContactValidationSchema = {
  contactId: { required: true, type: 'string' }
}

const getContactValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, getContactValidationSchema, 'params')
}

const getContact = async (req, res) => {
  try {
    const { contactId } = req.params
    const response = await razorpayService.getContactById(contactId)
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name getPayout
 * @path {GET} /api/payout/getPayout/:payoutId
 * @description Business Logic :- Get payout details by payout ID
 */
const getPayoutValidationSchema = {
  payoutId: { required: true, type: 'string' }
}

const getPayoutValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, getPayoutValidationSchema, 'params')
}

const getPayout = async (req, res) => {
  try {
    const { payoutId } = req.params
    const response = await razorpayService.getPayoutById(payoutId)
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name getBalance
 * @path {GET} /api/payout/getBalance
 * @description Business Logic :- Get account balance
 */
const getBalanceValidationSchema = {}

const getBalanceValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, getBalanceValidationSchema, 'query')
}

const getBalance = async (req, res) => {
  try {
    const response = await razorpayService.getAccountBalance()
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name addFunds
 * @path {POST} /api/payout/addFunds
 * @description Business Logic :- Add funds to mock account (Mock mode only)
 */
const addFundsValidationSchema = {
  amount: { required: true, type: 'number', min: 100 }
}

const addFundsValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, addFundsValidationSchema, 'body')
}

const addFunds = async (req, res) => {
  try {
    const { amount } = req.body
    const response = await razorpayService.addFundsToAccount(amount)
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name getStats
 * @path {GET} /api/payout/getStats
 * @description Business Logic :- Get mock service statistics (Mock mode only)
 */
const getStatsValidationSchema = {}

const getStatsValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, getStatsValidationSchema, 'query')
}

const getStats = async (req, res) => {
  try {
    const response = razorpayService.getStats()
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: response })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

/**
 * @memberof -RAZORPAY-PAYOUT-MODULE-
 * @name resetMockData
 * @path {POST} /api/payout/resetMockData
 * @description Business Logic :- Reset all mock data (Mock mode only)
 */
const resetMockDataValidationSchema = {}

const resetMockDataValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, resetMockDataValidationSchema, 'body')
}

const resetMockData = async (req, res) => {
  try {
    await razorpayService.resetMockData()
    res.sendJson({ type: __constants.RESPONSE_MESSAGES.SUCCESS, data: { message: 'Mock data reset successfully' } })
  } catch (err) {
    return res.sendJson({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

// Route definitions
router.post('/createContact', createContactValidation, createContact)
router.get('/getContact/:contactId', getContactValidation, getContact)

router.post('/createFundAccount', createFundAccountValidation, createFundAccount)

router.post('/createPayout', createPayoutValidation, createPayout)
router.get('/getPayout/:payoutId', getPayoutValidation, getPayout)

router.get('/getBalance', getBalanceValidation, getBalance)

// Mock-only routes
router.post('/addFunds', addFundsValidation, addFunds)
router.get('/getStats', getStatsValidation, getStats)
router.post('/resetMockData', resetMockDataValidation, resetMockData)

module.exports = router
