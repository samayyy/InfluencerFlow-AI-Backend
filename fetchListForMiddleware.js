const fs = require('fs').promises
const path = require('path')
const appModulePath = path.resolve(__dirname, 'controllers')
const readMiddlewareFunctions = async () => {
  try {
    const arrayOfAPI = []
    const folders = await fs.readdir(appModulePath) // read main folder of controller
    for (const folder of folders) { // read each folder of controller
      const folderPath = path.resolve(appModulePath, folder)
      const files = await fs.readdir(folderPath) // folder files
      for (const fileName of files) { // read each file
        const filePath = path.resolve(folderPath, fileName) // get path of each file for reading the code of file
        const data = await fs.readFile(filePath, 'utf8') // reading in process
        const lines = data.split('\n') // split with line from lines of code
        for (let i = 0; i < lines.length; i++) { // iteration of each line
          const line = lines[i].trim()
          if (line.startsWith('router.')) { // line of code where the router exists
            const startIndex = line.indexOf('(') // starting point
            const endIndex = line.lastIndexOf(')') // ending point
            if (startIndex !== -1 && endIndex !== -1) { // actual condition
              const argumentsStr = line.substring(startIndex + 1, endIndex) // get the string of router
              let names = argumentsStr.split(',').map(name => name.trim()) // get the middleware name by spliting the string into array
              names = names.slice(1, -1)
              const apiName = { name: fileName }
              for (const middleware of names) { apiName[middleware] = true }
              arrayOfAPI.push(apiName)
            }
          }
        }
      }
    }
    // file name middlewares.json is been generated in root folder of this project
    fs.writeFile('middlewares.json', JSON.stringify(arrayOfAPI, null, 2), 'utf8') // array of object with modules and apiname with its middleware are been appending into file one after another
  } catch (err) {
    console.error('Error reading files of middlewares :: ', err)
  }
}
readMiddlewareFunctions()
