// Standalone utility for generating profile pictures
const { faker } = require('@faker-js/faker')

class ProfilePictureGenerator {
  static generateAvatar (firstName, lastName, options = {}) {
    const {
      niche = 'general',
      style = 'random', // 'random', 'realistic', 'cartoon', 'minimal', 'niche-themed'
      size = 400,
      gender = null
    } = options

    const seed = `${firstName}${lastName}${Date.now()}`
    const genderForAvatar = gender || (Math.random() > 0.5 ? 'male' : 'female')

    switch (style) {
      case 'realistic':
        return [
          `https://randomuser.me/api/portraits/${
            genderForAvatar === 'male' ? 'men' : 'women'
          }/${faker.number.int({ min: 1, max: 99 })}.jpg`,
          `https://picsum.photos/${size}/${size}?random=${faker.number.int({
            min: 1,
            max: 1000
          })}`
        ][Math.floor(Math.random() * 2)]

      case 'cartoon':
        return [
          `https://api.dicebear.com/7.x/avataaars/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/personas/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/fun-emoji/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/lorelei/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/notionists/png?seed=${seed}&size=${size}`
        ][Math.floor(Math.random() * 5)]

      case 'minimal':
        return [
          `https://ui-avatars.com/api/?name=${firstName}+${lastName}&size=${size}&background=random&color=fff&format=png&rounded=true`,
          `https://api.dicebear.com/7.x/miniavs/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/thumbs/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/shapes/png?seed=${seed}&size=${size}`
        ][Math.floor(Math.random() * 4)]

      case 'niche-themed':
        if (niche === 'tech_gaming') {
          return [
            `https://api.dicebear.com/7.x/bottts/png?seed=${seed}&size=${size}`,
            `https://api.dicebear.com/7.x/shapes/png?seed=${seed}&size=${size}`,
            `https://api.dicebear.com/7.x/icons/png?seed=${seed}&size=${size}`
          ][Math.floor(Math.random() * 3)]
        } else if (niche === 'beauty_fashion') {
          return [
            `https://api.dicebear.com/7.x/lorelei/png?seed=${seed}&size=${size}`,
            `https://api.dicebear.com/7.x/notionists/png?seed=${seed}&size=${size}`,
            `https://api.dicebear.com/7.x/personas/png?seed=${seed}&size=${size}`
          ][Math.floor(Math.random() * 3)]
        } else if (niche === 'lifestyle_travel') {
          return [
            `https://api.dicebear.com/7.x/adventurer/png?seed=${seed}&size=${size}`,
            `https://api.dicebear.com/7.x/personas/png?seed=${seed}&size=${size}`,
            `https://randomuser.me/api/portraits/${
              genderForAvatar === 'male' ? 'men' : 'women'
            }/${faker.number.int({ min: 1, max: 99 })}.jpg`
          ][Math.floor(Math.random() * 3)]
        } else {
          return this.generateAvatar(firstName, lastName, {
            ...options,
            style: 'cartoon'
          })
        }

      case 'random':
      default:
        const allStyles = [
          `https://ui-avatars.com/api/?name=${firstName}+${lastName}&size=${size}&background=random&color=fff&format=png&rounded=true`,
          `https://api.dicebear.com/7.x/avataaars/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/personas/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/fun-emoji/png?seed=${seed}&size=${size}`,
          `https://randomuser.me/api/portraits/${
            genderForAvatar === 'male' ? 'men' : 'women'
          }/${faker.number.int({ min: 1, max: 99 })}.jpg`,
          `https://picsum.photos/${size}/${size}?random=${faker.number.int({
            min: 1,
            max: 1000
          })}`,
          `https://api.dicebear.com/7.x/miniavs/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/thumbs/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/bottts/png?seed=${seed}&size=${size}`,
          `https://api.dicebear.com/7.x/lorelei/png?seed=${seed}&size=${size}`
        ]
        return allStyles[Math.floor(Math.random() * allStyles.length)]
    }
  }

  static generateMultipleAvatars (creators) {
    return creators.map((creator) => ({
      ...creator,
      profile_image_url: this.generateAvatar(
        creator.first_name || creator.creator_name?.split(' ')[0] || 'Creator',
        creator.last_name || creator.creator_name?.split(' ')[1] || 'User',
        {
          niche: creator.niche,
          style: 'random'
        }
      )
    }))
  }

  static getAvatarStyles () {
    return {
      realistic: {
        name: 'Realistic Photos',
        description: 'Real-looking human faces',
        sources: ['RandomUser.me', 'Lorem Picsum']
      },
      cartoon: {
        name: 'Cartoon Avatars',
        description: 'Illustrated character avatars',
        sources: [
          'DiceBear Avataaars',
          'DiceBear Personas',
          'DiceBear Fun-Emoji'
        ]
      },
      minimal: {
        name: 'Minimal Design',
        description: 'Simple, clean avatar designs',
        sources: ['UI Avatars', 'DiceBear Miniavs', 'DiceBear Shapes']
      },
      'niche-themed': {
        name: 'Niche-Specific',
        description: 'Avatars styled for specific content niches',
        sources: [
          'Tech: Robot avatars',
          'Beauty: Stylized portraits',
          'Travel: Adventure themes'
        ]
      },
      random: {
        name: 'Mixed Styles',
        description: 'Random selection from all available styles',
        sources: ['All of the above']
      }
    }
  }
}

module.exports = ProfilePictureGenerator
