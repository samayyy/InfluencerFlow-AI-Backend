class Health {
  async health () { return true } // some async functionality
  async checkHealth () {
    try {
      const response = await this.health() // async function called
      return response
    } catch (err) {
      console.log('Error in checkHealth function :: err', err)
      throw new Error(err)
    }
  }
}

module.exports = new Health()
