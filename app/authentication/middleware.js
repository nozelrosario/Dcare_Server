var User = require('../models/users').init();
var jwt = require('jsonwebtoken');
var logger = require('../logger').init();
var secret = "supersecret";

function checkAuthentication() {
    //NR: Do not respond with specifc errors, [Dissolves footprints]
    return function (req, res, next) {
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        if (token) {
            // verifies secret and checks exp
            jwt.verify(token, secret, function (err, decoded) {
                if (err) {
                    logger.log("[MiddleWare Error] Token Verification Failed: ");
                    logger.error(err);
                    res.send({ status: "error", error : "Invalid Login" , message: "Invalid Login", data: '' });
                } else {
                    User.get(decoded.email).then(function (existingUser) {
                        if (existingUser.token) {
                            jwt.verify(existingUser.token, secret, function (err, dbTokenDecoded) {
                                if (err) {
                                    logger.log("[MiddleWare Error] DB Token Verification Failed: ");
                                    logger.error(err);
                                    res.send({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                                } else {
                                    if (dbTokenDecoded.tokenID === decoded.tokenID) {
                                        //Valid Login token -- resolve(existingUser);
                                        return next();
                                    } else {
                                        logger.log("[MiddleWare Error] Token Verification Failed: Token Expired");
                                        res.send({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                                    }
                                }
                            });
                        } else {
                            logger.log("[MiddleWare Error] Token Verification Failed: DB Token Absent");
                            res.send({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                        }

                    }).catch(function (err) {
                        logger.log("[MiddleWare Error] Token based user data extraction Failed: ");
                        logger.error(err);
                        res.send({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                    });
                }
            });
        } else {
            logger.log("[MiddleWare Error] Token Verification Failed: Request Token Absent");
            res.send({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
        }
  }
};

module.exports = checkAuthentication