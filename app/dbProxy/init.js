module.exports = function (app) {
    var User = require('../models/users').init();
    var jwt = require('jsonwebtoken');
    var logger = require('../logger').init();
    var appConfig = require("../../config/application");
    var secret = "supersecret";
    var Q = require("q");
    var http = require('http');

    app.all('/dbProxy*', function (request, response, next) {                        
        if (request.method !== "OPTIONS") {
            //NR: For All Requests 
            request.pause();
            checkAuthentication(request).then(function (tokenData) {
                if (tokenData && tokenData.status === 'success') {
                    // Set Auth Cokkie for DB
                    request.headers["Cookie"] = tokenData.data.cookie;
                    delete request.headers['x-access-token'];   //NR: Delete token as Couch db will only require Auth Cookie.
                    request.headers["host"] = "localhost:8100"; //NR: Required sometimes for Cloudant

                    //NR: Set CORS headers
                    response._headerNames["access-control-allow-credentials"] = "Access-control-Allow-Credentials";
                    response._headers["access-control-allow-origin"] = request.headers["origin"];
                    response._headers["access-control-allow-credentials"] = 'true';
                
                    //NR: Remove the express route name from db path.
                    var path = ((request.url).replace("/dbProxy", ""));
                    logger.log("Acceccing DB at : " + path);
                    var options = {
                        hostname: appConfig.dbHost,
                        port: appConfig.dbPort,
                        path: path,
                        method: request.method,
                        headers: request.headers
                    };

                    //NR: Initiate Proxy requrst to DB
                    var proxy_request = http.request(options);
                    
                    proxy_request.on('error', function (e) {
                        unknownError(response, e);
                    });
                    
                    request.on('data', function (chunk) {
                        proxy_request.write(chunk);
                    });
                    request.on('end', function () {
                        
                        proxy_request.end();
                    });

                    proxy_request.on('response', function (proxy_Response) {
                        // nginx does not support chunked transfers for proxied requests
                        delete proxy_Response.headers['transfer-encoding'];
                        
                        if (proxy_Response.statusCode == 503) {
                            logger.error("Database server not available.");                          
                            unknownError(response);                            
                        }
                        
                        response.writeHead(proxy_Response.statusCode, proxy_Response.headers);
                        
                        proxy_Response.on('data', function (chunk) {
                            response.write(chunk);
                        });
                        proxy_Response.on('close', function () {
                            response.end();
                        });
                        proxy_Response.on('end', function () {
                            response.end();
                        });
                        proxy_Response.on('aborted', function () {
                            response.end();
                        });
                    });                    
                    request.resume();
                } else {
                    unknownError(response);
                }
            }).catch(function (e) {
                unknownError(response, e);
            });
        } else {
            //NR: For OPTIONS Call, Respond With CORS headers & 200 OK
            response._headerNames["access-control-allow-credentials"] = "Access-control-Allow-Credentials";
            response._headers["access-control-allow-origin"] = request.headers["origin"];
            response._headers["access-control-allow-credentials"] = 'true';
            response.status(200);
            response.send('OK');
        }
    });
    
    //NR: Generic Error handling & notify. [Dissolves Footprints]
    function unknownError(response, e) {
        var errorCode = 500;
        logger.error(e.stack || 'Stack Trace: Empty');
        response.writeHead(errorCode, { 'Content-Type': 'application/json' });
        response.write(JSON.stringify({ error: "Unexpected error." }));
        response.end();
    }
    
    //NR: Token Validator function
    function checkAuthentication(req) {
        //NR: Do not respond with specifc errors, [Dissolves footprints]
        var deferedReq = Q.defer();
        var token = req.headers['x-access-token'];
        if (token) {
            // verifies secret and checks exp
            jwt.verify(token, secret, function (err, decoded) {
                if (err) {
                    logger.log("[MiddleWare Error] Token Verification Failed: ");
                    logger.error(err);
                    deferedReq.resolve({ status: "error", error : "Invalid Login" , message: "Invalid Login", data: '' });
                } else {
                    User.get(decoded.email).then(function (existingUser) {
                        if (existingUser.token) {
                            jwt.verify(existingUser.token, secret, function (err, dbTokenDecoded) {
                                if (err) {
                                    logger.log("[MiddleWare Error] DB Token Verification Failed: ");
                                    logger.error(err);
                                    deferedReq.resolve({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                                } else {
                                    if (dbTokenDecoded.tokenID === decoded.tokenID) {
                                        //Valid Login token -- resolve(existingUser);
                                        deferedReq.resolve({ status: "success", error : "", message: "Login Success", data: decoded });
                                    } else {
                                        logger.log("[MiddleWare Error] Token Verification Failed: Token Expired");
                                        deferedReq.resolve({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                                    }
                                }
                            });
                        } else {
                            logger.log("[MiddleWare Error] Token Verification Failed: DB Token Absent");
                            deferedReq.resolve({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                        }

                    }).catch(function (err) {
                        logger.log("[MiddleWare Error] Token based user data extraction Failed: ");
                        logger.error(err);
                        deferedReq.resolve({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
                    });
                }
            });
        } else {
            logger.log("[MiddleWare Error] Token Verification Failed: Request Token Absent");
            deferedReq.resolve({ status: "error", error : "Invalid Login", message: "Invalid Login", data: '' });
        }
        return deferedReq.promise;
    };


};


