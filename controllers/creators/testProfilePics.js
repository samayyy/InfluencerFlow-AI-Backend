const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const mockCreatorGenerator = require('../../services/creators/mockCreatorGenerator')

/**
 * @memberof -CREATORS-module-
 * @name testProfilePics
 * @path {GET} /api/creators/testProfilePics
 * @description Generate sample profile pictures for testing
 */

const validationSchema = {
  type: 'object',
  required: false,
  properties: {
    count: { type: 'string', required: false }
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'query')
}

const testProfilePics = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10

    const profilePicSamples = []

    for (let i = 0; i < count; i++) {
      const firstName = 'Test' + (i + 1)
      const lastName = 'Creator' + (i + 1)
      const niches = [
        'tech_gaming',
        'beauty_fashion',
        'lifestyle_travel',
        'food_cooking',
        'fitness_health'
      ]
      const niche = niches[i % niches.length]

      profilePicSamples.push({
        id: i + 1,
        name: `${firstName} ${lastName}`,
        niche: niche,
        profile_picture_url: mockCreatorGenerator.generateProfilePicture(
          firstName,
          lastName,
          niche
        ),
        avatar_style:
          i % 7 === 0
            ? 'UI Avatars'
            : i % 7 === 1
              ? 'DiceBear Avataaars'
              : i % 7 === 2
                ? 'DiceBear Personas'
                : i % 7 === 3
                  ? 'Random User'
                  : i % 7 === 4
                    ? 'Lorem Picsum'
                    : i % 7 === 5
                      ? 'DiceBear Miniavs'
                      : 'DiceBear Bottts'
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Generated ${count} sample profile pictures`,
        profile_pictures: profilePicSamples,
        usage_note:
          "These URLs generate different styles of avatars. You can use them in HTML like: <img src='url' alt='Profile' style='width: 100px; height: 100px; border-radius: 50%;' />"
      }
    })
  } catch (err) {
    console.error('Error in testProfilePics:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

router.get('/testProfilePics', validation, testProfilePics)

module.exports = router
