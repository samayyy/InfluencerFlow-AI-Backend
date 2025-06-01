const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const stripeService = require('../../services/stripe/stripePayout')

/**
 * @namespace -STRIPE-ACCOUNT-MODULE-
 * @description API's related to Stripe account management.
 */

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name createAccount
 * @path {POST} /api/stripe/account/create
 * @description Create a new Stripe Express account
 */
const createAccountValidationSchema = {
    type: 'object',
    properties: {
  type: { required: true, type: 'string' },
  country: { required: true, type: 'string' },
  email: { required: true, type: 'string' },
  business_type: { required: true, type: 'string' },
  individual: {
    required: true,
    type: 'object',
    properties: {
      first_name: { required: true, type: 'string' },
      last_name: { required: true, type: 'string' },
      email: { required: true, type: 'string' },
      dob: {
        required: true,
        type: 'object',
        properties: {
          day: { required: true, type: 'number' },
          month: { required: true, type: 'number' },
          year: { required: true, type: 'number' }
        }
      },
      address: {
        required: true,
        type: 'object',
        properties: {
          line1: { required: true, type: 'string' },
          city: { required: true, type: 'string' },
          state: { required: true, type: 'string' },
          postal_code: { required: true, type: 'string' },
          country: { required: true, type: 'string' }
        }
      }
    }
  },
  business_profile: {
    required: true,
    type: 'object',
    properties: {
      mcc: { required: true, type: 'string' },
      product_description: { required: true, type: 'string' }
    }
  }}
}

const createAccountValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, createAccountValidationSchema, 'body')
}

const createAccount = async (req, res) => {
  try {
    const accountData = req.body
    const result = await stripeService.createAccount(accountData)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result,
      message: 'Stripe account created successfully'
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name addExternalAccount
 * @path {POST} /api/stripe/account/:accountId/external-account
 * @description Add external account (bank account/card) to Stripe account
 */
const addExternalAccountValidationSchema = {
    type: 'object',
  properties: {
  external_account: { required: true, type: 'string' }
}}

const addExternalAccountValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, addExternalAccountValidationSchema, 'body')
}

const addExternalAccount = async (req, res) => {
  try {
    const { accountId } = req.params
    const { external_account } = req.body
    
    if (!accountId) {
      return res.sendJson({ 
        type: __constants.RESPONSE_MESSAGES.BAD_REQUEST, 
        err: 'Account ID is required' 
      })
    }

    const result = await stripeService.addExternalAccount(accountId, external_account)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result,
      message: 'External account added successfully'
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name createAccountLink
 * @path {POST} /api/stripe/account/link
 * @description Create account link for onboarding
 */
const createAccountLinkValidationSchema = {
    type: 'object',
  properties: {
  account: { required: true, type: 'string' },
  refresh_url: { required: true, type: 'string' },
  return_url: { required: true, type: 'string' },
  type: { required: true, type: 'string' }
}}

const createAccountLinkValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, createAccountLinkValidationSchema, 'body')
}

const createAccountLink = async (req, res) => {
  try {
    const linkData = req.body
    const result = await stripeService.createAccountLink(linkData)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result,
      message: 'Account link created successfully'
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name getAccount
 * @path {GET} /api/stripe/account/:accountId
 * @description Get Stripe account details
 */
const getAccount = async (req, res) => {
  try {
    const { accountId } = req.params
    
    if (!accountId) {
      return res.sendJson({ 
        type: __constants.RESPONSE_MESSAGES.BAD_REQUEST, 
        err: 'Account ID is required' 
      })
    }

    const result = await stripeService.getAccount(accountId)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result 
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name updateAccount
 * @path {PUT} /api/stripe/account/:accountId
 * @description Update Stripe account information
 */
const updateAccount = async (req, res) => {
  try {
    const { accountId } = req.params
    const updateData = req.body
    
    if (!accountId) {
      return res.sendJson({ 
        type: __constants.RESPONSE_MESSAGES.BAD_REQUEST, 
        err: 'Account ID is required' 
      })
    }

    const result = await stripeService.updateAccount(accountId, updateData)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result,
      message: 'Account updated successfully'
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name deleteAccount
 * @path {DELETE} /api/stripe/account/:accountId
 * @description Delete Stripe account
 */
const deleteAccount = async (req, res) => {
  try {
    const { accountId } = req.params
    
    if (!accountId) {
      return res.sendJson({ 
        type: __constants.RESPONSE_MESSAGES.BAD_REQUEST, 
        err: 'Account ID is required' 
      })
    }

    const result = await stripeService.deleteAccount(accountId)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result,
      message: 'Account deleted successfully'
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

/**
 * @memberof -STRIPE-ACCOUNT-module-
 * @name listExternalAccounts
 * @path {GET} /api/stripe/account/:accountId/external-accounts
 * @description List external accounts for a Stripe account
 */
const listExternalAccounts = async (req, res) => {
  try {
    const { accountId } = req.params
    
    if (!accountId) {
      return res.sendJson({ 
        type: __constants.RESPONSE_MESSAGES.BAD_REQUEST, 
        err: 'Account ID is required' 
      })
    }

    const result = await stripeService.listExternalAccounts(accountId)
    res.sendJson({ 
      type: __constants.RESPONSE_MESSAGES.SUCCESS, 
      data: result 
    })
  } catch (err) {
    return res.sendJson({ 
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, 
      err: err.message || err 
    })
  }
}

// Route definitions
router.post('/account/create', createAccountValidation, createAccount)
router.post('/account/:accountId/external-account', addExternalAccountValidation, addExternalAccount)
router.post('/account/link', createAccountLinkValidation, createAccountLink)
router.get('/account/:accountId', getAccount)
router.put('/account/:accountId', updateAccount)
router.delete('/account/:accountId', deleteAccount)
router.get('/account/:accountId/external-accounts', listExternalAccounts)

module.exports = router