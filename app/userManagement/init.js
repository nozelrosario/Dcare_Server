var userManagement = require('./userManagement')();
// Verify if request is valid & authenticated [checkAuthentication Middleware]
var checkAuthentication = require('../authentication/middleware.js');
module.exports = function (app) {
    app.post('/user/update', checkAuthentication(), function (req, res, next) {
        var user = req.body;
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        userManagement.update(user).then(function (updateResponse) {
            res.send({ status: "success", error : '', message: "Update Successful", data: updateResponse });
        }).catch(function (updateError) {            
            res.send({status: "error", error : updateError, message: "Update Failed", data:''});
        });
    });
};