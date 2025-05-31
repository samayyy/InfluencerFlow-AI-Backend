const crypto = require('crypto');

pass_func = {};

const configParamForPasswordForPassword = {
    // size of the generated hash
    hashBytes: 128,
    // larger salt means hashed passwords are more resistant to rainbow table, but
    // you get diminishing returns pretty fast
    saltBytes: 16,
    // more iterations means an attacker has to take longer to brute force an
    // individual password, so larger is better. however, larger also means longer
    // to hash the password. tune so that hashing the password takes about a
    // second
    iterations: 500000,
    digest: 'sha512'
};

genRandomString = (length) => {
    return crypto.randomBytes(Math.ceil(length/2))
        .toString('hex') /** convert to hexadecimal format */
        .slice(0,length);   /** return required number of characters */
};

sha512 = (password, salt) => {
    const hash = crypto.createHmac('sha512', salt); /** Hashing algorithm sha512 */
    hash.update(password);
    const value = hash.digest('hex');
    return {
        salt:salt,
        passwordHash:value
    };
};

saltHashPassword = (userpassword) => {
    const salt = genRandomString(16); /** Gives us salt of length 16 */
    return sha512(userpassword, salt);
};

pass_func.create_hash_of_password = (user_password, salt) => {
    return sha512(user_password, salt);
};


pass_func.genRandomString = genRandomString;
pass_func.sha512 = sha512;

module.exports = pass_func;
