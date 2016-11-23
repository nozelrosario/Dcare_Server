var config = require('../../../config');
//NR: Init Couch DB in Admin Mode. This is essential for db creation & applying user provisioning.
var database = config.database();
var appConfig = config.application;
var Q = require("q");
var logger = require('../../logger').init();
var User = require('../users').init();

module.exports = function () {
    
    var createDatabaseUser = function (username, password) {
        var deferedCreate = Q.defer();
        var db_user_id = "org.couchdb.user:" + username;
        var user_info_doc = {
            _id: db_user_id,
            name: username,
            password: password,
            type: 'user',
            roles: [username]
        };
        
        database.connect(appConfig.dbAdminCredentials).then(function (connection) {
            var couchDB = connection.dbConnection.db;
            couchDB.use("_users").get(db_user_id, function (err, body) {
                if (err) {
                    if (err.error === "not_found") {
                        logger.error("User not found [" + username + "] Error: " + err);
                        //NR: Attempt to insert new User
                        couchDB.use("_users").insert(user_info_doc, function (err, body) {
                            if (err) {
                                logger.error("Could not add new user [" + db_user_id + "] Error: " + err);
                                deferedCreate.reject(err);
                            } else {
                                logger.info("Inserted new user [" + db_user_id + "] successfully.");
                                deferedCreate.resolve();
                            }
                        });
                    } else {
                        deferedCreate.reject(err);
                    }
                } else {
                    logger.info("User found [" + username + "], Skipping user creaion.");
                    deferedCreate.resolve();
                }
            });
        }).catch(function (err) {
            deferedCreate.reject(err);
        });
        
        return deferedCreate.promise;
    };
    
    var isDBProvisioned= function (DBName, username) {
        var deferedCheck = Q.defer();
        
        return deferedCheck.promise;
    };
    
    var applyDatabaseProvisioning = function (DBName, username) {
        var deferedApply = Q.defer();
        var security_doc = {
            members: {
                names: [],
                roles: [username]
            },
            admins: {
                names: [username],
                roles: []
            }
        };
        var security_validation_doc = {
            language: "javascript",
            validate_doc_update: "function(new_doc, old_doc, userCtx) { if (userCtx.name != '" + username + "' && userCtx.roles.indexOf('" + username + "') == -1) { throw({forbidden: 'Not Authorized'}); } }"
        };
        var db_security_id = "_security";
        var db_validation_design_doc_id = "_design/_auth"
        database.connect(appConfig.dbAdminCredentials).then(function (connection) {
            var couchDB = connection.dbConnection.db;
            couchDB.use(DBName).insert(security_doc, db_security_id, function (err, body) {
                if (err) {
                    logger.error("Could not insert security doc into " + DBName + " Error: " + err);
                    deferedApply.reject(err);
                } else {
                    logger.info("Inserted security doc into " + DBName + " successfully.");
                    logger.info("Attempting to insert security validation Doc in [" + DBName + "]");
                    couchDB.use(DBName).insert(security_validation_doc, db_validation_design_doc_id, function (err, body) {
                        if (err) {
                            logger.error("Could not insert security validation design doc into " + DBName + " Error: " + err);
                            deferedApply.reject(err);
                        } else {
                            logger.info("Inserted security validation design doc into " + DBName + " successfully.");
                            deferedApply.resolve();
                        }
                    });
                }
            });
        }).catch(function (err) {
            deferedApply.reject(err);
        });
        return deferedApply.promise;
    };
    
    var isDataBaseCreated = function (dBName) {
        var deferedGet = Q.defer();
        logger.log("Detecting if User Store exists");
        database.connect(appConfig.dbAdminCredentials).then(function (connection) {
            var couchDB = connection.dbConnection.db;
            couchDB.get(dBName, function (err, body) {
                if (err) {
                    logger.log("User Store Check Failed [Error]: " + err);
                    deferedGet.reject();
                } else {
                    deferedGet.resolve(couchDB.use(dBName));
                }
            });
        }).catch(function (err) {
            deferedGet.reject();
        });        
        return deferedGet.promise;
    };
    
    //NR: skipps creatig db is it exists
    //NR: if not exist, create db & apply provisioning on it.
    var createDataBase = function (dBName, dbUser) {
        var deferedGet = Q.defer();
        isDataBaseCreated(dBName).then(function (dbInstance) {
            deferedGet.resolve(dbInstance);
        }).catch(function () {
            database.connect(appConfig.dbAdminCredentials).then(function (connection) {
                var couchDB = connection.dbConnection.db;
                couchDB.create(dBName, function (err, body) {
                    if (err) {
                        logger.error("Could not create " + dBName + " [Error]: " + err);
                        deferedGet.reject();
                    } else {
                        //NR: Assuming Db user is already created. else this will result in error
                        applyDatabaseProvisioning(dBName, dbUser).then(function () {
                            deferedGet.resolve(couchDB.use(dBName));
                        }).catch(function (err) {
                            deferedGet.reject();
                        });                        
                    }
                });
            }).catch(function (err) {
                deferedGet.reject();
            });
        });
        return deferedGet.promise;
    };
        
    var initSyncedDataStore = function (dataStoreName, clusterGuid, dbUser) {
        var deferedInit = Q.defer();
        var internalDBName = "dc_" + clusterGuid + "_" + dataStoreName;
        createDataBase(internalDBName, dbUser).then(function (dataStoreReference) {
            deferedInit.resolve(dataStoreReference);
        }).catch(function (err) {
            deferedInit.reject();
        });
        return deferedInit.promise;
    };
    
    var initSyncedDataStores = function (clusterGuid, dbUser) {
        var deferedInit = Q.defer();
        if (clusterGuid) {
            var availableDataEntities = appConfig.syncedDataStores;
            var unifiedInitCalls = [];
            //NR: Ensure DbUser is created. [Create DB user with a default password.]
            createDatabaseUser(dbUser, appConfig.dbUserCredentials.password).then(function () {
                //NR: Post User creation proceed wth db creations & provisioning
                for (var i = 0; i < availableDataEntities.length; i++) {
                    unifiedInitCalls.push(initSyncedDataStore(availableDataEntities[i], clusterGuid, dbUser));
                }
                Q.all(unifiedInitCalls).then(function (results) {
                    deferedInit.resolve();
                }).catch(function (err) {
                    logger.error("Could not Init DB's [Error]: " + err);
                    deferedInit.reject();
                });           
            }).catch(function (err) {
                deferedInit.reject();
            });            
        } else {
            logger.error("Could not Init DB's [Error]: " + "Missing User Guid");
            deferedInit.reject();
        }
        
        return deferedInit.promise;
    };
    
    var initSyncedDataStoresForUser = function (userID) {
        var deferedInit = Q.defer();
        var remotePatients;
        var unifiedInitCalls = [];
        User.get(userID).then(function (existingUser) {
            if (existingUser.dbUser) {
                remotePatients = existingUser.patients;
                for (var j = 0; j < remotePatients.length; j++) {
                    unifiedInitCalls.push(initSyncedDataStores(remotePatients[j].guid, existingUser.dbUser));
                }
                Q.all(unifiedInitCalls).then(function (results) {
                    deferedInit.resolve();
                }).catch(function (err) {
                    logger.error("Could not Init DB's for Patient " + existingUser.guid + "[Error]: " + err);
                    deferedInit.reject();
                });
            } else {
                error = "User does not have Database Access. Please Contact Support team.";
                logger.error(error);
                deferedInit.reject();
            }
        }).catch(function (err) {
            logger.error("Could not Init DB's for User:- "+ userID +" [Error]:- " + err);
            deferedInit.reject();
        });
        return deferedInit.promise;
    };

    return {
        initSyncedDataStores: initSyncedDataStores,
        initSyncedDataStoresForUser: initSyncedDataStoresForUser,
        createDataStoreUser : createDatabaseUser
    };
};