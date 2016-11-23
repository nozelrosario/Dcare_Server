var config = require('../../../config');
//NR: Init Couch DB in Admin Mode. This is essential for as user is Admin Owned DB.
var database = config.database();
var appConfig = config.application;
var Q = require("q");
var logger = require('../../logger').init();

var dataStoreName = "users";

module.exports = function () {

	/*
	 * Private Members
	 */
	var isUserStoreCreated = function () {
		var deferedGet = Q.defer();
        logger.info("Detecting if User Store exists");
        database.connect(appConfig.dbAdminCredentials).then(function (connection) {
            var couchDB = connection.dbConnection.db;
            couchDB.get(dataStoreName, function (err, body) {
                if (err) {
                        logger.error("User Store Check Failed [Error]: " + err);
                        deferedGet.reject();                   
                } else {
                    deferedGet.resolve(couchDB.use(dataStoreName));
                }
            });
        }).catch(function (err) {
            deferedGet.reject();
        });
		
		return deferedGet.promise;
	};
    
    var applyUsersStoreProvisioning = function () {
        var deferedApply = Q.defer();
        var DBName = dataStoreName;
        var adminUsername = appConfig.dbAdminCredentials.username;
        var adminRole = "_admin";   //NR: Provisioned only for default Couch DB admin role.
        var security_doc = {
            members: {
                names: [],
                roles: [adminRole]
            },
            admins: {
                names: [adminUsername],
                roles: []
            }
        };
        
        var security_validation_doc = {
            language: "javascript",
            validate_doc_update: "function(new_doc, old_doc, userCtx) { if (userCtx.name != '" + adminUsername + "' && userCtx.roles.indexOf('" + adminRole + "') == -1) { throw({forbidden: 'Not Authorized'}); } }"
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

	var getUserStore = function () {
		var deferedGet = Q.defer();
		isUserStoreCreated().then(function (userStore) {
			deferedGet.resolve(userStore);
        }).catch(function () {
            database.connect(appConfig.dbAdminCredentials).then(function (connection) {
                var couchDB = connection.dbConnection.db;
                couchDB.create(dataStoreName, function (err, body) {
                    if (err) {
                        logger.error("Could not create " + dataStoreName + " [Error]: " + err);
                        deferedGet.reject();
                    } else {
                        applyUsersStoreProvisioning().then(function () {
                            deferedGet.resolve(couchDB.use(dataStoreName));
                        }).catch(function (err) {
                            logger.error("Could not provision " + dataStoreName + " [Error]: " + err);
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

	/*
	 * Public Members
	 */
	var get = function (userID) {
		var deferedGet = Q.defer();
		getUserStore().then(function (userStore) {
			userStore.get(userID, function (err, body) {
				if (err) {
					logger.error("Could not get data from " + dataStoreName + " Error: " + err);
					deferedGet.reject(err);
				} else {
					deferedGet.resolve(body);
				}
			});
		}).catch (function (err) {
            logger.error("Could not get data in " + dataStoreName + " [Error]: Error connecting DB ");
            deferedGet.reject(err);
		});
		return deferedGet.promise;
	};

	var add = function (user) {
        var deferedAdd = Q.defer();
        var generateUserGUID = function () {
            /**
                * Based on Math.uuid.js (v1.4)
                *   http://www.broofa.com
                *   mailto:robert@broofa.com
                *   Copyright (c) 2010 Robert Kieffer
                *   Dual licensed under the MIT and GPL licenses.
                */
                //NR: GUID used as username for DB provisioning so following constraints applies. 
                //    => Only lower case characters (a-z), digits (0-9)
                //    => Any of the characters _, $  are allowed. 
                
                var CHARS = '0123456789abcdefghijklmnopqrstuvwxyz_$'.split('');
            var generateUUID = function (len, radix) {
                var chars = CHARS, uuid = [], i;
                radix = radix || chars.length;
                
                if (len) {
                    // Compact form
                    for (i = 0; i < len; i++) uuid[i] = chars[0 | Math.random() * radix];
                } else {
                    app.log.error("Length argument required for GUID generation");
                }
                return "dc_" + uuid.join('');
            };
            
            return generateUUID(10).toString();
        };
        user._id = user.email;
        user.dbUser = generateUserGUID();
		getUserStore().then(function (userStore) {
			userStore.insert(user, function (err, body) {
				if (err) {
					logger.error("Could not insert into " + dataStoreName + " Error: " + err);
					deferedAdd.reject(err);
				} else {
					deferedAdd.resolve(body);
				}
			});
		}).catch (function (err) {            
            deferedAdd.reject(err);
		});
		return deferedAdd.promise;
	};

	var update = function (user) {
		var deferedUpdate = Q.defer();
		this.get(user._id).then(function (existingUser) {
			if (existingUser._id !== "" && existingUser._rev !== "") {
				user._rev = existingUser._rev;
				getUserStore().then(function (userStore) {
					userStore.insert(user, function (err, body) {
						if (err) {
							logger.error("Could not Update data in " + dataStoreName + " [Error]: " + err);
							deferedUpdate.reject(err);
						} else {
							deferedUpdate.resolve(body);
						}
					});
				}).catch (function (err) {
                    logger.error("Could not Update data in " + dataStoreName + " [Error]: Error connecting DB ");
                    deferedUpdate.reject(err);
				});
			} else {
                logger.error("Could not Update data in " + dataStoreName + " [Error]: Record Not Found ");
                deferedUpdate.reject();
			}

		}).catch (function (err) {
            logger.error("Could not Update data in " + dataStoreName + " [Error]: " + err);
            deferedUpdate.reject();
		});
		return deferedUpdate.promise;
	};
	return {
		get : get,
		add : add,
		update : update
	};

};