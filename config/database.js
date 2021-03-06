var Q = require("q");
var logger = require('../app/logger').init();
var appConfig = require("./application");
var fs = require('fs')
    , path = require('path')
    , certFile = 'SSL/server.crt'//path.resolve('D:\Nozel\Work\Projects\SSL', 'server.crt')
    , keyFile = 'SSL/server.key';//path.resolve('D:\Nozel\Work\Projects\SSL', 'server.key');
    //, caFile = path.resolve('D:\Nozel\Work\Projects\SSL', 'ssl/ca.cert.pem');
// DB Configs
var database = function(){
    var dbUrl = appConfig.dbHostProtocol + '://' + appConfig.dbHost + ':' + appConfig.dbPort + '';
    var defaultConnectionInfo = {
        username: '',
        password: '',
        url: dbUrl,
        requestDefaults: {}
    };
    var connect = function (connectionConfig) {
        var deferedConnect = Q.defer();
        var connection = { dbConnection: '', sessionInfo: '', sessionCookie: '' };
        //NR: Merge Configs
        connectionConfig.username = connectionConfig.username || defaultConnectionInfo.username;
        connectionConfig.password = connectionConfig.password || defaultConnectionInfo.password;
        connectionConfig.url = connectionConfig.url || defaultConnectionInfo.url;
        connectionConfig.requestDefaults = connectionConfig.requestDefaults || defaultConnectionInfo.requestDefaults;  //https://github.com/request/request
        
        if (connectionConfig.cookie) {
            connectionConfig.cookie = connectionConfig.cookie;  //AuthSession=
        } else {
            delete connectionConfig.cookie;
        }
        
        // Instantiate DB
        connectionConfig.log = function (id, args) {
            logger.log("-Nano-start");
            logger.log(id);
            logger.log("-Nano-end");
        };
        
        if (appConfig.dbHostProtocol === "https") {
            //connectionConfig.cert = fs.readFileSync(certFile);
            //connectionConfig.key = fs.readFileSync(keyFile);
            //connectionConfig.passphrase = 'password';
            connectionConfig.requestDefaults = {
                pool: { maxSockets: 1000 },
                strictSSL: false
            };
            //connectionConfig.requestDefaults.agentOptions = {
            //    ca: fs.readFileSync(certFile)
            //};
            //connectionConfig.ca = fs.readFileSync(caFile);
        }

        connection.dbConnection = require('nano')(connectionConfig);
        
        var attemptCredentialBasedAuthentication = function (userName, password) {
            connection.dbConnection.auth(userName, password, function (err, body, headers) {
                if (err) {
                    logger.error("Error authenticating DB session. [Error]" + err);
                    deferedConnect.reject(err);
                } else {
                    if (headers && headers['set-cookie']) {
                        connection.sessionCookie = (headers['set-cookie'])[0];
                        // Set the admin cookie to shared config for later use
                        if (connectionConfig.username === "admin") {
                            appConfig.dbAdminCredentials.cookie = connection.sessionCookie;
                        }

                        //NR: Re-Establish db session with acquired cookie [Issue-old session was being passed on]
                        connectionConfig.cookie = connection.sessionCookie;
                        connection.dbConnection = require('nano')(connectionConfig);
                        connection.dbConnection.session(function (err, session) {
                            if (err) {
                                logger.error("Error obtaining DB session. [Error]" + err);
                                deferedConnect.reject(err);
                            } else {
                                connection.sessionInfo = session;
                                deferedConnect.resolve(connection);
                            }
                        });
                    } else {
                        logger.error("Error while acquiring Auth_Cookie. Please check DB configurations");
                        deferedConnect.reject();
                    }
                }
            });
        };
           
        if (connectionConfig.cookie) {                                          //NR: Establish session based on provided cookie
            connection.sessionCookie = connectionConfig.cookie;
            connection.dbConnection.session(function (err, session) {
                if (err || (session.userCtx && session.userCtx.name === null)) {                                                      
                    logger.error("Error obtaining cookie based DB session. [Error]" + err);
                    if (connectionConfig.username === "admin") {
                        appConfig.dbAdminCredentials.cookie = '';       //NR: Clear saved cookie in case of admin access
                    }
                    if (connectionConfig.username && connectionConfig.password) {       //NR: If Cookie authentication fails, attempt username/password based.
                        logger.error("Attempting credential based authentication.");
                        attemptCredentialBasedAuthentication(connectionConfig.username, connectionConfig.password);
                    } else {
                        deferedConnect.reject(err);
                    }                    
                } else {
                    connection.sessionInfo = session;
                    deferedConnect.resolve(connection);
                }
            });
        } else if (connectionConfig.username && connectionConfig.password) {   //NR: Establish session based on username & password
            attemptCredentialBasedAuthentication(connectionConfig.username, connectionConfig.password);
        } else {
            deferedConnect.resolve(connection);
        }        
        return deferedConnect.promise;
    };
    
    return {
        connect: connect
    };

};

module.exports = database;