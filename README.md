![](https://www.wohlig.com/_nuxt/img/241480c.png) FrameWork
-------------
#### To Run This Application Follow The Steps Below : 
```sh
$ git clone https://github.com/wohlig/Wohlig-Framework-V2
```
```sh 
$ cd  Wohlig-Framework-V2/
```
>Create a file named `.env` in root of the application and paste the content at the end of this document in newly created file.

```sh
$ npm i
```
```sh
$ npm run develop
```

#### For Local development :
```sh
Use nodemon in package.json (nodemon server.js)
```

```sh
NOTES :
Use standard.js for the VS Code for your development environment to maintain the standard of Javascript among all the team members.
Below given are the steps for installation pf  standard.js for VS code
```
#### Disable your current beautifier.
#### Standard Js Installation :
```sh
1. Go to Extensions in your left navigation bar of VS Code
2. Type Standard js in search box
3. Click on Standard js then install it. (It will automatically gets enabled)
4. Inside settings of standard.js enable the on-save functionality (which will automatically do beautification on CTRL + S)
```

```sh
npm run standard 

```




#### Developement environment .env file :
Sample .env
```sh
NODE_ENV = development
PORT = 3005
BASE_URL = ''
REDIS_INIT = false
REDIS_HOST = localhost
REDIS_NO_READY_CHECK = true
REDIS_AUTH_PASS = ''
REDIS_PORT = 6379
REDIS_DB = ''
AUTHENTICATION_INTERNAL_ALLOW = true
APP_NAME = framework
MONGO_INIT = false
MONGO_URL = mongodb://127.0.0.1:27017/myapp
APM_ENABLE_APM = false
APM_SERVICE_NAME = framework
APM_SECRET_TOKEN = twW4p9qC4vhYgWstdF
APM_SERVER_URL = https://71e04c24c1db4adf87a5d7d76f6fb555.apm.ap-south-1.aws.elastic-cloud.com:443
APM_ENVIRONMENT = development
APM_LOG_UNCAUGHT_EXCEPTIONS = true
APM_TRANSACTION_SAMPLE_RATE = 0.1
ELASTIC_CLOUD_ID = cloud:ELASTIC_CLOUD_ID
ELASTIC_USERNAME = ELASTIC_USERNAME
ELASTIC_PASSWORD = ELASTIC_PASSWORD
VAULT_ENDPOINT = VAULT_ENDPOINT
VAULT_ROLE_ID = VAULT_ROLE_ID
VAULT_SECRET_ID = VAULT_SECRET_ID
VAULT_PATH = VAULT_PATH
USE_VAULT = false
AUTHENTICATION_JWT_SECRET_KEY = bchvceydfgwfdwydrs
ELASTIC_INIT_USER_ACTIVITY = false
ADD_BASEURL_PREFIX = false
DEBUG_MODE = false
USER_BASED_CACHE = false
```
#### USER_BASED_CACHE FUNCTIONALITY :
```sh
USER_BASED_CACHE = false means the request is cached in redis based on only url
USER_BASED_CACHE = true means the request is cached in redis based on params such as "req.body, req.query, req.params"

```


#### Docker build command :
```sh
docker buildx build -t github.com/wohlig/wohlig-framework-v2 .
```

#### For Redis cache utility :
```sh
1. For redis-cache utility make sure that REDIS_INIT value in .env should be true
2. If redis-cache is not in use then make sure that REDIS_INIT value in .env should be false.
Note for point number 2, we also need to remove the cache.route() function for its controller for smoothly creating the build for the current app.
```

#### Example code caching the request :
```sh
Require the redis cache as shown below.
const cache = require('../../../middlewares/requestCacheMiddleware')
then use it wisely as second middleware of the route.
router.post('/getAllUsers/subUsers/:wa', cache.route(100), validation, getAllSubUsers)
Passing 100 as a params means expiry time is 100 sec.
```

