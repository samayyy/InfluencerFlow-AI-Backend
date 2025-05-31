module.exports = {
  INVALID_REQUEST: {
    status_code: 400,
    code: 4000,
    message: 'Invalid request'
  },
  NOT_FOUND: {
    status_code: 404,
    code: 4004,
    message: 'requested resource not found.'
  },
  NOT_AUTHORIZED: {
    status_code: 401,
    code: 4001,
    message: 'Unauthorized access.'
  },
  PAYMENT_REQUIRED: {
    status_code: 402,
    code: 4002,
    message: 'Payment required.'
  },
  ACCESS_DENIED: {
    status_code: 403,
    code: 4003,
    message: 'Access denied'
  },
  SERVER_TIMEOUT: {
    status_code: 408,
    code: 4008,
    message: 'request timeout.'
  },
  RATE_LIMITED: {
    status_code: 429,
    code: 4029,
    message: 'Too many request. request rate limited'
  },
  PROVIDE_FILE: {
    status_code: 400,
    code: 4030,
    message: 'Please provide a file'
  },
  INVALID_FILE_TYPE: {
    status_code: 400,
    code: 4031,
    message: 'Invalid file type'
  },
  INVALID_URL: {
    status_code: 400,
    code: 4032,
    message: 'Invalid request URL'
  },
  INVALID_FILE_SIZE: {
    status_code: 400,
    code: 4033,
    message: 'File size or pixel is less than expected'
  },
  SERVER_ERROR: {
    status_code: 500,
    code: 5000,
    message: 'Something went wrong. Please try again later.'
  },
  SERVICE_PROVIDER_NOT_PRESENT: {
    status_code: 500,
    code: 5000,
    message: 'Please ensure service provider data is present.'
  },
  // Note: use codes 2000 to 2999 for api success
  SUCCESS: {
    status_code: 200,
    code: 2000,
    message: 'Success'
  },
  ACCEPTED: {
    status_code: 202,
    code: 2002,
    message: 'Request Accepted'
  },
  EMAIL_VC: {
    status_code: 200,
    code: 2001,
    message: 'Please check your registered email for verification code'
  },
  PHONE_VC: {
    status_code: 200,
    code: 2002,
    message: 'Please check your registered contact number for verification code'
  },
  EMAIL_VERIFIED: {
    status_code: 200,
    code: 2003,
    message: 'Email address verified'
  },
  PHONE_VERIFIED: {
    status_code: 200,
    code: 2003,
    message: 'Phone number verified'
  },
  // Note: use codes 3000 to 3999 for api error
  NO_RECORDS_FOUND: {
    status_code: 200,
    code: 3000,
    message: 'No record found.'
  },
  INVALID_CODE: {
    status_code: 200,
    code: 3002,
    message: 'Response code and msg not mention. please select valid response code.'
  },
  FAILED: {
    status_code: 200,
    code: 3003,
    message: 'Failed'
  },
  LOGIN_FAILED: {
    status_code: 200,
    code: 3004,
    message: 'credential are wrong.'
  },
  USERNAME_EXIST: {
    status_code: 200,
    code: 3005,
    message: 'username already exists.'
  },
  USER_EXIST: {
    status_code: 200,
    code: 3008,
    message: 'user already exists.'
  },
  INACTIVE_USER: {
    status_code: 200,
    code: 3006,
    message: 'inactive user.'
  },
  REDIRECTION_FAILED: {
    status_code: 200,
    code: 3007,
    message: 'failed to redirect.'
  },
  PROCESS_FAILED: {
    status_code: 200,
    code: 3010,
    message: 'Failed to process request.'
  },
  UPLOAD_FAILED: {
    status_code: 200,
    code: 3011,
    message: 'Upload failed.'
  },
  RECORD_EXIST: {
    status_code: 200,
    code: 3013,
    message: 'Record Already Exists.'
  },
  USER_ID_NOT_EXIST: {
    status_code: 200,
    code: 3014,
    message: 'User does not exist'
  },
  EMAIL_ALREADY_VERIFIED: {
    status_code: 200,
    code: 3015,
    message: 'Email already verified for user'
  },
  PHONE_ALREADY_VERIFIED: {
    status_code: 200,
    code: 3016,
    message: 'Phone number already verified for user'
  },
  INVALID_VERIFICATION_CODE: {
    status_code: 401,
    code: 3017,
    message: 'Invalid verification code'
  },
  NOT_REDIRECTED: {
    status_code: 406,
    code: 3025,
    message: 'Fail to redirect payload'
  },
  LIMIT_EXCEEDED: {
    status_code: 400,
    code: 3033,
    message: 'You\'ve exceeded the allowed limit please try again after some time'
  },
  EMAIL_FORGET_PASSWORD: {
    status_code: 200,
    code: 2001,
    message: 'Link to set new password has been sent on your registered email'
  },
  INVALID_PASS_TOKEN: {
    status_code: 200,
    code: 3036,
    message: 'Invalid token.'
  },
  EMAIL_OTP: {
    status_code: 200,
    code: 2001,
    message: 'Please check your registered email for one time code'
  },
  SMS_OTP: {
    status_code: 200,
    code: 2001,
    message: 'Please check your registered phone number for one time code'
  },
  TFA_NOT_SETTED_UP: {
    status_code: 200,
    code: 3041,
    message: 'Please Setup 2FA first.'
  },
  INVALID_TFA_TYPE: {
    status_code: 200,
    code: 3042,
    message: 'Invalid tfa type.'
  },
  TFA_ALREADY_SETTED_UP: {
    status_code: 200,
    code: 3043,
    message: '2FA setup already done'
  },
  QRCODE_GEN_ERR: {
    status_code: 200,
    code: 3044,
    message: 'Unable to generate QRcode'
  },
  TEMP_TFA_NOT_FOUND: {
    status_code: 200,
    code: 3045,
    message: 'Authentication method change request not found'
  },
  AUTHENTICATOR_QR_GENERATED: {
    status_code: 200,
    code: 2001,
    message: 'Please scan the QRcode or enter the secret key in authenticator app and then enter the OTP received.'
  },
  AUTHENTICATOR_CHECK_APP: {
    status_code: 200,
    code: 2001,
    message: 'Please check the authenticator app and then enter the OTP received.'
  },
  INVALID_BACKUP_CODE: {
    status_code: 401,
    code: 3046,
    message: 'Invalid backup code'
  },
  ERROR_CALLING_PROVIDER: {
    status_code: 500,
    code: 5005,
    message: 'Something went wrong. Please try again later.'
  },
  NOT_AUTHORIZED_JWT: {
    status_code: 401,
    code: 4001,
    message: 'Unauthorized'
  },
  LOGOUT: {
    status_code: 200,
    code: 3069,
    message: 'Successfully Logged Out'
  },
  INVALID_EMAIL: {
    status: 400,
    code: 3090,
    message: 'Invalid email'
  },
  USER_BLOCKED: {
    status: 400,
    code: 3091,
    message: 'User is blocked'
  },
  INVALID_PASSWORD: {
    status: 400,
    code: 3092,
    message: 'Password is incorrect'
  },
  INVALID_PHONE: {
    status: 400,
    code: 3093,
    message: 'Phone is incorrect'
  },
  INVALID_NEW_PASSWORD: {
    status: 400,
    code: 3094,
    message: 'New password cannot be same as old password'
  },
  NO_VALID_ROLE_ASSIGNED: {
    status: 400,
    code: 3095,
    message: 'No valid role is assigned to the logged in user'
  },
  SUB_USER_NOT_EXIST: {
    status_code: 400,
    code: 3096,
    message: 'Subuser does not exist'
  },
  ADD_SUBUSER_LIMIT_EXCEEDED: {
    status_code: 400,
    code: 3097,
    message: 'Max number of subusers to be added is exceeded'
  },
  INVALID_ROUTES: {
    status_code: 400,
    code: 3098,
    message: 'Invalid routes'
  },
  USER_ID_IS_NOT_OF_TYPE_STRING: {
    status_code: 400,
    code: 3099,
    message: 'User Id is not of type string'
  },
  SET_PASSWORD_BEFORE_LOGIN: {
    status_code: 200,
    code: 3100,
    message: 'Please set the password using the set password link sent to you before trying to login'
  },
  NO_SESSION_IDS_FOR_FORCE_LOGOUT: {
    status_code: 200,
    code: 3101,
    message: 'There is no open session of the user you are trying to force logout'
  },
  NEW_EMAIL_CANNOT_BE_SAME_AS_OLD: {
    status_code: 200,
    code: 3102,
    message: 'New email cannot be as same old email'
  },
  INVALID_ROLE_ID: {
    status_code: 400,
    code: 3106,
    message: 'Invalid role id'
  },
  PROVIDE_UNIQUE_USERIDS: {
    status_code: 400,
    code: 3107,
    message: 'Please provide unique user ids'
  },
  INVALID_USER_IDS: {
    status_code: 400,
    code: 3108,
    message: 'Invalid user ids'
  },
  INVALID_SUBUSER_IDS: {
    status_code: 400,
    code: 3109,
    message: 'Invalid subuser ids'
  },
  INVALID_GROUP_ID: {
    status_code: 400,
    code: 3110,
    message: 'Invalid group id'
  },
  ROLE_IDS_ARE_OF_MULTIPLE_OWNER: {
    status_code: 400,
    code: 3111,
    message: 'Role ids are not of one single owner'
  },
  INVALID_ROLE_IDS: {
    status_code: 400,
    code: 3112,
    message: 'Invalid role ids'
  },
  INVALID_ROLE_OR_GROUP_IDS: {
    status_code: 400,
    code: 3113,
    message: 'Invalid role ids or group ids'
  },
  GROUP_NAME_EXISTS: {
    status_code: 400,
    code: 3114,
    message: 'Group name already exists'
  },
  ROLE_NAME_EXISTS: {
    status_code: 400,
    code: 3115,
    message: 'Role name already exists'
  },
  CANNOT_DELETE_GROUP: {
    status_code: 400,
    code: 3116,
    message: 'Cannot delete group which is not created by you'
  },
  ROLE_IDS_SHOULD_BE_VALID_AND_OF_SAME_USER_TYPE: {
    status_code: 400,
    code: 3117,
    message: 'Role ids should be valid and of same user type'
  },
  INVALID_RESOURCE_ID: {
    status_code: 400,
    code: 3118,
    message: 'Invalid resource id'
  },
  ROUTE_ALREADY_MAPPED_TO_ROLES: {
    status_code: 200,
    code: 3119,
    message: 'Route is already mapped to all the provided role ids'
  },
  GROUP_IDS_SHOULD_BE_VALID_AND_OF_SAME_USER_TYPE: {
    status_code: 400,
    code: 3120,
    message: 'Group ids should be valid and of same user type'
  },
  INVALID_GROUP_IDS: {
    status_code: 400,
    code: 3121,
    message: 'Invalid group ids'
  },
  ROLE_ALREADY_MAPPED_TO_GROUPS: {
    status_code: 200,
    code: 3122,
    message: 'Role is already mapped to all the provided group ids'
  },
  PROVIDE_UNIQUE_GROUPIDS: {
    status_code: 400,
    code: 3123,
    message: 'Please provide unique group ids'
  },
  VERIFICATION_CHANNEL_NOT_CONFIGURED: {
    status_code: 400,
    code: 3124,
    message: 'Verification channel not configured'
  },
  USER_DETAILS_EXIST: {
    status_code: 200,
    code: 3125,
    message: 'user details already exists.'
  },
  PLAYER_NOT_ALLOWED: {
    status_code: 401,
    code: 3129,
    message: 'Unauthorized Access'
  },
  INVALID_DATE: {
    status_code: 400,
    code: 3130,
    message: 'Invalid Dates'
  }
}
