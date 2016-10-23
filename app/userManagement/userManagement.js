var User = require('../models/users').init();
var SyncedStores = require('../models/syncedStores').init();
var Q = require("q");
var logger = require('../logger').init();

module.exports = function () {
    var isValidatePatientData = function (patientData) {
        var isValid = false
        if (patientData.guid && patientData.fullName) {
            isValid = true;
        }
        return isValid;
    };

    var update = function (user) {
        var deferedUpdate = Q.defer();     
        var localPatients, remotePatients;
        if (user.patients && user.patients.length > 0) {
            localPatients = user.patients;
            User.get(user.email).then(function (existingUser) {
                remotePatients = existingUser.patients;
                var localPatient, remotePatient, isLocalPatientFound;
                for (var i = 0; i < localPatients.length; i++) {
                    localPatient = localPatients[i];
                    if (isValidatePatientData(localPatient)) {
                        isLocalPatientFound = false;
                        for (var j = 0; j < remotePatients.length; j++) {
                            remotePatient = remotePatients[j];
                            if (remotePatient && remotePatient.guid && localPatient.guid === remotePatient.guid) {
                                // Patient exists, => Update 
                                isLocalPatientFound = true;
                                remotePatient.fullName = localPatient.fullName;
                                remotePatient.photo = localPatient.photo;
                                remotePatient.isDefault = localPatient.isDefault;
                                break;
                            }
                        }
                        if (!isLocalPatientFound) {
                            // Patient doesnot exists => Add new
                            var newPatient = {};
                            newPatient.guid = localPatient.guid;
                            newPatient.fullName = localPatient.fullName;
                            newPatient.photo = localPatient.photo;
                            newPatient.isDefault = localPatient.isDefault;
                            remotePatients.push(newPatient);
                        // TODO : trigget DB creations post update in users DB done.
                        
                        }
                    } else {
                        logger.error("Invalid Patient Data");
                        deferedUpdate.reject("Invalid Patient Data");
                        break;
                    }                    
                }
                // Push the updated patient data back to User dB
                User.update(existingUser).then(function (updatedUserData) {
                    SyncedStores.initSyncedDataStoresForUser(existingUser.email).then(function () {
                        deferedUpdate.resolve(updatedUserData);
                    }).catch(function (err) {
                        logger.log("[Error] Init DB Stores Failed: " + err);
                        deferedUpdate.reject(err.message);
                    });                    
                }).catch(function (err) {
                    logger.log("[Error] Updating Patient Data Failed: " + err);
                    deferedUpdate.reject(err.message);
                });
            }).catch(function (err) {
                logger.log("[Error] Read User data faled while updating Patient Data : " + err);
                deferedUpdate.reject(err.message);
            });
        }
        return deferedUpdate.promise;
    };

    return {
        update:update
    };
};