const { faker } = require("@faker-js/faker");

class MockCreatorGenerator {
  constructor() {
    this.niches = {
      tech_gaming: {
        keywords: [
          "tech",
          "gaming",
          "review",
          "unboxing",
          "tutorial",
          "gadget",
        ],
        content_types: [
          "product_reviews",
          "tutorials",
          "unboxing",
          "gaming_streams",
        ],
        brands: [
          "Apple",
          "Samsung",
          "NVIDIA",
          "AMD",
          "Razer",
          "SteelSeries",
          "Intel",
          "Google",
        ],
        audience_age: "18-34",
        gender_split: { male: 75, female: 22, other: 3 },
      },
      beauty_fashion: {
        keywords: ["beauty", "makeup", "skincare", "fashion", "style", "haul"],
        content_types: [
          "tutorials",
          "hauls",
          "reviews",
          "outfit_posts",
          "skincare",
        ],
        brands: [
          "Sephora",
          "Ulta",
          "Zara",
          "H&M",
          "Glossier",
          "Fenty Beauty",
          "Rare Beauty",
        ],
        audience_age: "16-35",
        gender_split: { female: 85, male: 12, other: 3 },
      },
      lifestyle_travel: {
        keywords: [
          "travel",
          "lifestyle",
          "adventure",
          "city",
          "culture",
          "food",
        ],
        content_types: [
          "travel_vlogs",
          "city_guides",
          "lifestyle_tips",
          "adventure",
        ],
        brands: [
          "Airbnb",
          "Booking.com",
          "GoPro",
          "Away",
          "Patagonia",
          "North Face",
        ],
        audience_age: "22-45",
        gender_split: { female: 60, male: 38, other: 2 },
      },
      food_cooking: {
        keywords: ["food", "cooking", "recipe", "restaurant", "chef", "baking"],
        content_types: [
          "recipes",
          "restaurant_reviews",
          "cooking_tutorials",
          "food_challenges",
        ],
        brands: [
          "HelloFresh",
          "Blue Apron",
          "KitchenAid",
          "Whole Foods",
          "Trader Joes",
        ],
        audience_age: "25-50",
        gender_split: { female: 70, male: 28, other: 2 },
      },
      fitness_health: {
        keywords: ["fitness", "workout", "health", "nutrition", "gym", "yoga"],
        content_types: [
          "workout_routines",
          "nutrition_tips",
          "fitness_challenges",
          "wellness",
        ],
        brands: [
          "Nike",
          "Adidas",
          "Lululemon",
          "MyFitnessPal",
          "Peloton",
          "Fitbit",
        ],
        audience_age: "18-40",
        gender_split: { female: 65, male: 33, other: 2 },
      },
    };

    this.platforms = ["youtube", "instagram", "tiktok", "twitter"];
    this.tiers = ["micro", "macro", "mega"];
    this.tierWeights = [60, 30, 10]; // 60% micro, 30% macro, 10% mega
  }

  getRandomChoice(array, weights = null) {
    if (!weights) {
      return array[Math.floor(Math.random() * array.length)];
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let randomNum = Math.random() * totalWeight;

    for (let i = 0; i < array.length; i++) {
      randomNum -= weights[i];
      if (randomNum <= 0) {
        return array[i];
      }
    }
    return array[array.length - 1];
  }

  generateFollowerCount(tier) {
    switch (tier) {
      case "micro":
        return faker.number.int({ min: 1000, max: 99999 });
      case "macro":
        return faker.number.int({ min: 100000, max: 999999 });
      case "mega":
        return faker.number.int({ min: 1000000, max: 50000000 });
      default:
        return faker.number.int({ min: 1000, max: 99999 });
    }
  }

  generateEngagementRate(platform, tier) {
    const rates = {
      youtube: { micro: [2.5, 8.0], macro: [1.8, 4.5], mega: [0.8, 2.2] },
      instagram: { micro: [3.5, 12.0], macro: [2.0, 6.5], mega: [0.9, 3.5] },
      tiktok: { micro: [8.0, 25.0], macro: [5.0, 15.0], mega: [2.5, 8.0] },
      twitter: { micro: [1.5, 4.0], macro: [0.8, 2.5], mega: [0.3, 1.2] },
    };

    const [min, max] = rates[platform][tier];
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
  }

  generatePlatformMetrics(platform, tier, followerCount) {
    const engagementRate = this.generateEngagementRate(platform, tier);

    let metrics = {
      follower_count: followerCount,
      engagement_rate: engagementRate,
    };

    switch (platform) {
      case "youtube":
        const avgViews = Math.floor(
          followerCount *
            (tier === "micro"
              ? Math.random() * 0.2 + 0.05
              : tier === "macro"
              ? Math.random() * 0.12 + 0.03
              : Math.random() * 0.07 + 0.01)
        );
        metrics = {
          ...metrics,
          following_count: null,
          post_count: faker.number.int({ min: 50, max: 1500 }),
          avg_views: avgViews,
          avg_likes: Math.floor(avgViews * (engagementRate / 100)),
          avg_comments: Math.floor(avgViews * (engagementRate / 100) * 0.1),
          avg_shares: Math.floor(avgViews * (engagementRate / 100) * 0.02),
          followers_gained_30d: Math.floor(followerCount * 0.02),
          total_videos: faker.number.int({ min: 50, max: 1000 }),
          story_views_avg: null,
        };
        break;

      case "instagram":
        metrics = {
          ...metrics,
          following_count: faker.number.int({ min: 500, max: 5000 }),
          post_count: faker.number.int({ min: 100, max: 2000 }),
          avg_views: null,
          avg_likes: Math.floor(followerCount * (engagementRate / 100)),
          avg_comments: Math.floor(
            followerCount * (engagementRate / 100) * 0.05
          ),
          avg_shares: Math.floor(followerCount * (engagementRate / 100) * 0.02),
          followers_gained_30d: Math.floor(followerCount * 0.015),
          total_videos: null,
          story_views_avg: Math.floor(followerCount * 0.25),
        };
        break;

      case "tiktok":
        const tikTokViews = Math.floor(
          followerCount *
            (tier === "micro"
              ? Math.random() * 3 + 0.5
              : tier === "macro"
              ? Math.random() * 2 + 0.3
              : Math.random() * 1.5 + 0.2)
        );
        metrics = {
          ...metrics,
          following_count: faker.number.int({ min: 100, max: 2000 }),
          post_count: faker.number.int({ min: 50, max: 1000 }),
          avg_views: tikTokViews,
          avg_likes: Math.floor(tikTokViews * (engagementRate / 100)),
          avg_comments: Math.floor(tikTokViews * (engagementRate / 100) * 0.03),
          avg_shares: Math.floor(tikTokViews * (engagementRate / 100) * 0.02),
          followers_gained_30d: Math.floor(followerCount * 0.05),
          total_videos: faker.number.int({ min: 50, max: 800 }),
          story_views_avg: null,
        };
        break;

      case "twitter":
        metrics = {
          ...metrics,
          following_count: faker.number.int({ min: 200, max: 3000 }),
          post_count: faker.number.int({ min: 500, max: 10000 }),
          avg_views: Math.floor(followerCount * 0.1),
          avg_likes: Math.floor(followerCount * (engagementRate / 100)),
          avg_comments: Math.floor(
            followerCount * (engagementRate / 100) * 0.1
          ),
          avg_shares: Math.floor(followerCount * (engagementRate / 100) * 0.05),
          followers_gained_30d: Math.floor(followerCount * 0.01),
          total_videos: null,
          story_views_avg: null,
        };
        break;
    }

    return metrics;
  }

  generateAudienceDemographics(niche) {
    const nicheData = this.niches[niche];

    // Generate age distribution
    const ageDistribution = {
      age_13_17: faker.number.float({ min: 5, max: 20, precision: 0.1 }),
      age_18_24: faker.number.float({ min: 25, max: 45, precision: 0.1 }),
      age_25_34: faker.number.float({ min: 20, max: 40, precision: 0.1 }),
      age_35_44: faker.number.float({ min: 10, max: 25, precision: 0.1 }),
      age_45_plus: faker.number.float({ min: 5, max: 15, precision: 0.1 }),
    };

    // Normalize to 100%
    const total = Object.values(ageDistribution).reduce(
      (sum, val) => sum + val,
      0
    );
    Object.keys(ageDistribution).forEach((key) => {
      ageDistribution[key] = parseFloat(
        ((ageDistribution[key] / total) * 100).toFixed(1)
      );
    });

    return {
      ...ageDistribution,
      gender_male: nicheData.gender_split.male,
      gender_female: nicheData.gender_split.female,
      gender_other: nicheData.gender_split.other,
      top_countries: [
        "United States",
        "United Kingdom",
        "Canada",
        "Australia",
        "Germany",
      ],
      interests: faker.helpers.arrayElements(
        [
          "lifestyle",
          "technology",
          "fashion",
          "travel",
          "food",
          "fitness",
          "entertainment",
          "education",
          "music",
        ],
        { min: 3, max: 6 }
      ),
    };
  }

  generatePricing(tier, platform) {
    const baseRates = {
      youtube: { micro: [100, 500], macro: [500, 5000], mega: [5000, 50000] },
      instagram: { micro: [50, 300], macro: [300, 3000], mega: [3000, 30000] },
      tiktok: { micro: [75, 400], macro: [400, 4000], mega: [4000, 40000] },
      twitter: { micro: [25, 150], macro: [150, 1500], mega: [1500, 15000] },
    };

    const [min, max] = baseRates[platform][tier];
    const sponsoredPostRate = faker.number.int({ min, max });

    return {
      sponsored_post: sponsoredPostRate,
      story_mention: Math.floor(sponsoredPostRate * 0.3),
      video_integration: Math.floor(sponsoredPostRate * 1.5),
      brand_ambassadorship_monthly: Math.floor(sponsoredPostRate * 2.5),
      event_coverage: Math.floor(sponsoredPostRate * 0.8),
      currency: "USD",
    };
  }

  generateProfilePicture(firstName, lastName, niche, gender = null) {
    // Determine gender for more realistic avatars
    const genderForAvatar = gender || (Math.random() > 0.5 ? "male" : "female");

    // Multiple profile picture sources for variety
    const profilePicOptions = [
      // UI Avatars - text-based avatars with initials
      `https://ui-avatars.com/api/?name=${firstName}+${lastName}&size=400&background=random&color=fff&format=png&rounded=true`,

      // DiceBear API - cartoon style avatars
      `https://api.dicebear.com/7.x/avataaars/png?seed=${firstName}${lastName}&size=400`,
      `https://api.dicebear.com/7.x/personas/png?seed=${firstName}${lastName}&size=400`,
      `https://api.dicebear.com/7.x/fun-emoji/png?seed=${firstName}${lastName}&size=400`,

      // Random user photos (This Girl/Boy Does Not Exist style)
      `https://randomuser.me/api/portraits/${
        genderForAvatar === "male" ? "men" : "women"
      }/${faker.number.int({ min: 1, max: 99 })}.jpg`,

      // Lorem Picsum with faces
      `https://picsum.photos/400/400?random=${faker.number.int({
        min: 1,
        max: 1000,
      })}`,

      // Placeholder avatars with different styles
      `https://api.dicebear.com/7.x/miniavs/png?seed=${firstName}${lastName}&size=400`,
      `https://api.dicebear.com/7.x/thumbs/png?seed=${firstName}${lastName}&size=400`,

      // Niche-specific themed avatars
      ...(niche === "tech_gaming"
        ? [
            `https://api.dicebear.com/7.x/bottts/png?seed=${firstName}${lastName}&size=400`,
            `https://api.dicebear.com/7.x/shapes/png?seed=${firstName}${lastName}&size=400`,
          ]
        : []),

      ...(niche === "beauty_fashion"
        ? [
            `https://api.dicebear.com/7.x/lorelei/png?seed=${firstName}${lastName}&size=400`,
            `https://api.dicebear.com/7.x/notionists/png?seed=${firstName}${lastName}&size=400`,
          ]
        : []),

      // Backup faker avatar
      faker.image.avatar(),
    ];

    return this.getRandomChoice(profilePicOptions);
  }

  generateSingleCreator() {
    const niche = this.getRandomChoice(Object.keys(this.niches));
    const nicheData = this.niches[niche];
    const tier = this.getRandomChoice(this.tiers, this.tierWeights);
    const primaryPlatform = this.getRandomChoice(this.platforms);

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const creatorName = `${firstName} ${lastName}`;

    // Generate username variations
    const usernameStyles = [
      `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
      `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
      `${firstName.toLowerCase()}${this.getRandomChoice(nicheData.keywords)}`,
      `${this.getRandomChoice(nicheData.keywords)}${firstName.toLowerCase()}`,
      `${firstName.toLowerCase()}${faker.number.int({ min: 10, max: 99 })}`,
    ];
    const username = this.getRandomChoice(usernameStyles);

    // Generate bio
    const bioTemplates = [
      `${niche
        .replace("_", " ")
        .replace(/\b\w/g, (l) =>
          l.toUpperCase()
        )} creator sharing ${this.getRandomChoice(
        nicheData.content_types
      ).replace("_", " ")} 📸`,
      `💫 ${this.getRandomChoice(nicheData.content_types)
        .replace("_", " ")
        .replace(/\b\w/g, (l) => l.toUpperCase())} • Building community`,
      `${creatorName} | ${niche
        .replace("_", " ")
        .replace(/\b\w/g, (l) =>
          l.toUpperCase()
        )} enthusiast 🎯 DM for collabs`,
      `Creating ${this.getRandomChoice(nicheData.content_types).replace(
        "_",
        " "
      )} content daily ✨ Business: email below`,
    ];

    const followerCount = this.generateFollowerCount(tier);

    // Generate platform metrics for primary platform and 1-2 additional platforms
    const platforms = [primaryPlatform];
    const additionalPlatforms = this.platforms.filter(
      (p) => p !== primaryPlatform
    );
    const numAdditionalPlatforms =
      Math.random() > 0.7 ? 2 : Math.random() > 0.4 ? 1 : 0;

    for (let i = 0; i < numAdditionalPlatforms; i++) {
      if (additionalPlatforms.length > 0) {
        const platform = additionalPlatforms.splice(
          Math.floor(Math.random() * additionalPlatforms.length),
          1
        )[0];
        platforms.push(platform);
      }
    }

    const platformMetrics = {};
    const audienceDemographics = {};
    const pricing = {};

    platforms.forEach((platform) => {
      const platformFollowerCount =
        platform === primaryPlatform
          ? followerCount
          : Math.floor(followerCount * (0.3 + Math.random() * 0.4));
      platformMetrics[platform] = this.generatePlatformMetrics(
        platform,
        tier,
        platformFollowerCount
      );
      audienceDemographics[platform] = this.generateAudienceDemographics(niche);
      pricing[platform] = this.generatePricing(tier, platform);
    });

    return {
      creator_name: creatorName,
      username: username,
      bio: this.getRandomChoice(bioTemplates),
      email: `${username}@${this.getRandomChoice([
        "gmail.com",
        "outlook.com",
        "yahoo.com",
      ])}`,
      business_email: `business.${username}@gmail.com`,
      profile_image_url: this.generateProfilePicture(
        firstName,
        lastName,
        niche
      ),
      verification_status:
        tier !== "micro" && Math.random() > 0.7 ? "verified" : "unverified",
      account_created_date: faker.date.between({
        from: "2018-01-01",
        to: "2023-01-01",
      }),
      last_active_date: faker.date.recent({ days: 7 }),
      location_country: faker.location.country(),
      location_city: faker.location.city(),
      location_timezone: faker.location.timeZone(),
      languages: faker.helpers.arrayElements(
        ["English", "Spanish", "French", "German", "Italian", "Portuguese"],
        { min: 1, max: 3 }
      ),
      niche: niche,
      content_categories: nicheData.content_types,
      tier: tier,
      primary_platform: primaryPlatform,
      total_collaborations: faker.number.int({
        min: tier === "micro" ? 0 : 5,
        max: tier === "mega" ? 200 : 50,
      }),
      avg_response_time_hours: faker.number.int({ min: 1, max: 72 }),
      response_rate_percentage: faker.number.float({
        min: 60,
        max: 95,
        precision: 0.1,
      }),
      avg_delivery_time_days: faker.number.int({ min: 3, max: 14 }),
      client_satisfaction_score: faker.number.float({
        min: 4.0,
        max: 5.0,
        precision: 0.1,
      }),
      platform_metrics: platformMetrics,
      audience_demographics: audienceDemographics,
      pricing: pricing,
    };
  }

  generateMultipleCreators(count = 500) {
    const creators = [];
    for (let i = 0; i < count; i++) {
      creators.push(this.generateSingleCreator());
      if (i % 50 === 0) {
        console.log(`Generated ${i + 1}/${count} creators...`);
      }
    }
    return creators;
  }
}

module.exports = new MockCreatorGenerator();
