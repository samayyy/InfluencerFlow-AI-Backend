module.exports = error => {
  new Promise((resolve, reject) => {
    reject(error)
  })
}
