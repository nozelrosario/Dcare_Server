var config = require('../../config');
var appConfig = config.application;
var database = config.database();
var User = require('../models/users').init();
var SyncedStores = require('../models/syncedStores').init();
var Q = require("q");
var bcrypt = require('bcrypt-nodejs');
var jwt = require('jsonwebtoken');
var logger = require('../logger').init();
var secret = "supersecret";
module.exports = function () {
    
    var emailVerificationLinkToUser = function (email, host) {
        var deferedSendEmail = Q.defer();      
        var sendEmail = function (link) {
            //NR: email emplate + details
            logger.log(link);
        };
        if (email && isValidEmail(email)) {
            User.get(email).then(function (existingUser) {
                if (existingUser.emailVerified) {
                    sendEmail("Email Already verified");
                } else if (existingUser.emailVerficationCode) {                    
                    sendEmail(host +  "/verifyemail?email=" + existingUser.email + "&token=" + existingUser.emailVerficationCode);
                }
                deferedSendEmail.resolve();
            }).catch(function (err) {
                deferedSendEmail.reject();
            });
        } else {
            deferedSendEmail.reject();
        }
        return deferedSendEmail.promise;
    };

    var signup = function (user, hostURL) {
        var deferedSignup = Q.defer();
        var validationResult = validateUserData(user);
        var result = {
            errors : [],
            status : '',
            message : ''
        };
        var addUser = function (user, promise) {
            user.password = generateHash(user.password);
            user.emailVerified = false;
            user.emailVerficationCode = _generate_random_unique_ID(11);
            user.createdOn = Date.now();
            if (!user.patients) user.patients = [];            
            User.add(user).then(function (newUser) {
                result.message = "Signup Success, Please check your email & click verify link to login";
                result.status = "ok";
                emailVerificationLinkToUser(user.email, hostURL);
                promise.resolve(result);
            }).catch(function (err) {
                result.errors.push(err);
                result.status = "error";
                result.message = "Error while Signup";
                promise.reject(result);
            });
        };
        if (validationResult.length === 0) {
            User.get(user.email).then(function (existingUser) {
                if (existingUser && existingUser._id) {
                    result.errors.push("User Id already taken.");
                    result.status = "error";
                    result.message = "Error while Signup";
                    deferedSignup.reject(result);
                } else {
                    addUser(user, deferedSignup);
                }
            }).catch(function (err) {
                addUser(user, deferedSignup);
            });
        } else {
            result.errors = validationResult;
            result.message = "Error while Signup";
            result.status = "error";
            deferedSignup.reject(result);
        }
        return deferedSignup.promise;
    };
    
    var isValidEmail = function (email) {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    };

    var validateUserData = function (user) {
        var errors = [];
        if (user && user.email && user.firstname && user.lastname) {
            if (isValidEmail(user.email)) { }
            else {
                errors.push("Email Id is not valid");
            }
        } else {
            errors.push("Not all mandatory data is provided");
        }
        return errors;
    };
    
    // Encryption/Decryption Methods ======================
    // generating a hash
    var generateHash = function (password) {
        return bcrypt.hashSync(password, bcrypt.genSaltSync(8));
    };
    
    // checking if password is valid
    var isValidPassword = function (raw_password, enc_password) {
        return bcrypt.compareSync(raw_password, enc_password);
    };
    
    var isValidToken = function (token) {
        var deferedValidate = Q.defer();
        if (token) {
            // verifies secret and checks exp
            jwt.verify(token, secret, function (err, decoded) {
                if (err) {
                    logger.log("[Error] Token Verification Failed: " + err);
                    deferedValidate.reject(err);
                } else {
                    User.get(decoded.email).then(function (existingUser) {
                        if (existingUser.token) {
                            jwt.verify(existingUser.token, secret, function (err, dbTokenDecoded) {
                                if (err) {
                                    logger.log("[Error] DB Token Verification Failed: " + err);
                                    deferedValidate.reject(err);
                                } else {
                                    if (dbTokenDecoded.tokenID === decoded.tokenID) {
                                        deferedValidate.resolve(existingUser);
                                    } else {
                                        logger.log("[Error] Token Verification Failed: Token Expired");
                                        deferedValidate.reject("Token Expired");
                                    }
                                }
                            });
                        } else {
                            deferedValidate.resolve(existingUser);
                        }

                    }).catch(function (err) {
                        logger.log("[Error] Token based user data extraction Failed: " + err);
                        deferedValidate.reject("Invalid Token Data");
                    });
                }
            });
        } else {
            deferedValidate.reject("Invalid Token");
        }
        return deferedValidate.promise;
    };
    
    var _generate_random_unique_ID = function (len) {
        var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split(''); // Token Charset
        var uuid = [],
            i;
        var radix = chars.length;
        for (i = 0; i < len; i++)
            uuid[i] = chars[0 | Math.random() * radix];
        return uuid.join('');
    };
    
    var createToken = function (data) {
        var tokenValidity = appConfig.sessionValidity;
        var tokenIDLength = 10; // Token ID Length
        var generateTokenID = function () {
            return _generate_random_unique_ID(tokenIDLength);
        };
        data.tokenID = generateTokenID();
        var token = jwt.sign(data, secret, {
            expiresIn : tokenValidity
        });
        delete data.tokenID;
        return token;
    };
    
    /*
	 * Filters unwanted User data and packs only required data to be sent
	 */
	var tokenizeUserData = function (user, isLoginToken) {
        var deferedTokenize = Q.defer();
        var userInfo = {
            email : user.email            
        };
        var userInfoTokenPacket = {
            email : user.email
        };
        var error, dbUserCredentials = {};
        
        // Create DB-User session
        if (user.dbUser) {
            dbUserCredentials.password = appConfig.dbUserCredentials.password;
            dbUserCredentials.username = user.dbUser;   // Set current user for obtaining session
            database.connect(dbUserCredentials).then(function (connection) {
                //NR: Push dB Auth cookie to token
                userInfoTokenPacket.cookie = (connection.sessionCookie) ? connection.sessionCookie : '';
                user.token = createToken(userInfoTokenPacket);
                if (isLoginToken) {
                    //If login token , then update login time.
                    user.lastLoginTime = Date.now();
                }
                User.update(user).then(function (updatedUserData) {
                    userInfo.token = user.token;
                    if (isLoginToken) {
                        //If login token , only then include all login info.
                        userInfo.firstname = user.firstname;
                        userInfo.lastname = user.lastname;
                        userInfo.patients = user.patients;
                        userInfo.phone = user.phone;
                    }                    
                    deferedTokenize.resolve(userInfo);
                }).catch(function (err) {
                    deferedTokenize.reject(err);
                });
            }).catch(function (err) {
                deferedTokenize.reject(err);
            });
        } else {
            error = "User does not have Database Access. Please Contact Support team.";
            logger.error(error);
            deferedTokenize.reject(error);
        }
        

        
        return deferedTokenize.promise;
    };
    
    var login = function (userID, password, token) {
        //NR: Always reject with generic error , do not return specific errors [dissolves footprints]
        var deferedLogin = Q.defer();
        if (token) {
            isValidToken(token).then(function (existingUser) {
                tokenizeUserData(existingUser, true).then(function (userInfo) {
                    deferedLogin.resolve(userInfo);
                }).catch(function (err) {
                    logger.error("login > tokenizeUserDatalogin failed : [Error] " + err);
                    deferedLogin.reject("Invalid Login");
                });
            }).catch(function (err) {
                logger.error("login > tokenizeUserDatalogin failed : [Error] " + err);
                deferedLogin.reject("Invalid Login");
            });
        } else if (userID && password) {
            User.get(userID).then(function (existingUser) {
                if (existingUser.emailVerified === true) {
                    if (isValidPassword(password, existingUser.password)) {
                        tokenizeUserData(existingUser, true).then(function (userInfo) {
                            deferedLogin.resolve(userInfo);
                        }).catch(function (err) {
                            logger.error("login > tokenizeUserDatalogin failed : [Error] " + err);
                            deferedLogin.reject("Invalid Login");
                        });
                    } else {
                        deferedLogin.reject("Invalid Login");
                    }
                } else {
                    deferedLogin.reject("Email not verified. Please verify email first.");
                }                
            }).catch(function (err) {
                logger.error("login > ger user data failed : [Error] " + err);
                deferedLogin.reject("Invalid Login");
            });
        } else {
            deferedLogin.reject("Invalid Login");
        }
        return deferedLogin.promise;
    };
    
    var refreshToken = function (token) {
        //NR: Always reject with generic error , do not return specific errors [dissolves footprints]
        var deferedLogin = Q.defer();
        if (token) {
            isValidToken(token).then(function (existingUser) {
                tokenizeUserData(existingUser).then(function (userInfo) {
                    deferedLogin.resolve(userInfo);
                }).catch(function (err) {
                    logger.error("login > tokenizeUserDatalogin failed : [Error] " + err);
                    deferedLogin.reject("Invalid Login");
                });
            }).catch(function (err) {
                logger.error("login > tokenizeUserDatalogin failed : [Error] " + err);
                deferedLogin.reject("Invalid Login");
            });
        } else {
            deferedLogin.reject("Invalid Login");
        }
        return deferedLogin.promise;
    };
    
    var logout = function (token) {
        //NR: Always resolve promise , do not return specific errors [dissolves footprints]
        var deferedLogout = Q.defer();
        if (token) {
            isValidToken(token).then(function (existingUser) {
                existingUser.token = "";
                User.update(existingUser).then(function (updatedUserData) {                    
                    deferedLogout.resolve(true);
                }).catch(function (err) {
                    deferedLogout.resolve(true);
                    //deferedLogout.reject(err);
                });
            }).catch(function (err) {
                deferedLogout.resolve(true);
                //deferedLogout.reject(err);
            });
        } else {
            deferedLogout.resolve(true);
        }
        return deferedLogout.promise;
    };
    
    var verifyEmail = function (email, verificationToken) {
        //do not return specific errors like alreadyverified, email error etc. [dissolves footprints]
        var deferedVerify = Q.defer();
        if (email && isValidEmail(email) && verificationToken) {
            User.get(email).then(function (existingUser) {
                if (existingUser.emailVerficationCode === verificationToken) {
                    if (existingUser.dbUser) {
                        SyncedStores.createDataStoreUser(existingUser.dbUser, appConfig.dbUserCredentials.password).then(function () {
                            //NR: DB user Creatio success ? , then Update verification Flags
                            existingUser.emailVerified = true;
                            existingUser.emailVerficationCode = "verified";
                            User.update(existingUser).then(function () {
                                deferedVerify.resolve();
                            }).catch(function (error) {
                                deferedVerify.reject();
                            });
                        }).catch(function (err) {
                            logger.error("Email Verification Failed as DB user creation Failed: [ERROR]: " + err);
                            deferedVerify.reject();
                        }); 
                    } else {
                        error = "User does not have Database Access. Please Contact Support team.";
                        logger.error(error);
                        deferedVerify.reject();
                    }                                                           
                } else {
                    deferedVerify.reject();
                }
            }).catch(function (err) {
                deferedVerify.reject();
            });
        } else {
            deferedVerify.reject();
        }
        return deferedVerify.promise;
    };

    return {
        signup : signup,
        login : login,
        refreshToken: refreshToken,
        logout: logout,
        verifyEmail: verifyEmail
    };
};