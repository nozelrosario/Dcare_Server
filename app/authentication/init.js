module.exports = function (app) {
	var authentication = require('./authentication')();

	app.post('/login', function (req, res, next) {
		var userId = req.body.email;
		var password = req.body.password;
		var token = req.body.token || req.query.token || req.headers['x-access-token'];
		authentication.login(userId, password, token).then(function (signInResponse) {
			res.json({ status: "success", error : '', message: "Login Successful", data: signInResponse });
		}).catch (function (signInError) {
			res.json({ status: "error", error : signInError, message: "Login Failed", data: '' });
		});
    });
    
    app.get('/refresh_token', function (req, res, next) {
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        authentication.refreshToken(token).then(function (refreshedTokenResponse) {
            res.cookie("Nozel_sds");
            res.json({ status: "success", error : '', message: "Successfully Refreshed Token ", data: refreshedTokenResponse });
        }).catch(function (signInError) {
            res.json({ status: "error", error : signInError, message: "Token Refresh Failed", data: '' });
        });
    });

	app.post('/signup', function (req, res, next) {
        var userData = req.body;
        var hostURL = req.protocol + '://' + req.get('host');
		authentication.signup(userData, hostURL).then(function (signupResponse) {
			res.json({ status: "success", error : '', message: "Signup Successful", data: signupResponse });
		}).catch (function (signupError) {
			res.json({ status: "error", error : signupError, message: "Signup Failed", data: '' });
		});
    });
    
    app.get('/verifyemail', function (req, res, next) {
        var userEmail = req.query.email;
        var verificationToken = req.query.token;        
        authentication.verifyEmail(userEmail, verificationToken).then(function (signupResponse) {
            //res.json({ status: "success", error : '', message: "Verification Successful", data: signupResponse });
            res.render('authentication/verifyEmail', { status: "success", error : '', message: "Verification Successful", data: signupResponse })
        }).catch(function (signupError) {
            //res.json({ status: "error", error : signupError, message: "Verification Failed", data: '' });
            res.render('authentication/verifyEmail', { status: "success", error : '', message: "Verification Failed, Please Try again", data: signupError })
        });
    });

	app.get('/logout', function(req, res) {
        authentication.logout().then(function () {
            res.json({ status: "success", error : '', message: "Logout Successful", data: '' });
        }).catch(function (logoutError) {
            res.json({ status: "error", error : logoutError, message: "Logout Failed", data: '' });
        });
		
	});
};