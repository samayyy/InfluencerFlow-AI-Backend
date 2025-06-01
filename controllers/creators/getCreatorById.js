const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const creatorService = require('../../services/creators/creatorService')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
    id: { type: 'string', required: true }
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'params')
}

const getCreatorById = async (req, res) => {
  try {
    const creator = await creatorService.getCreatorById(req.params.id)

    if (!creator) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        data: null
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: creator
    })
  } catch (err) {
    console.error('Error in getCreatorById:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

router.get('/getCreatorById/:id', validation, getCreatorById)

module.exports = router
