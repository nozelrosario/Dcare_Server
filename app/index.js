const path = require('path');
const express  = require('express');
const app      = express();
const exphbs = require('express-handlebars');
const logger =  require('./logger').init();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const expressSession = require('express-session');
const config = require('../config');

/***
 * Init Middlewares
 */
var allowCrossDomain = function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, x-access-token');
    
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
        res.send(200);
    }
    else {
        next();
    }
};

/**
 * Initialize View Engine
 * */
app.engine('.hbs', exphbs({
    defaultLayout: 'layout',
    extname: '.hbs',
    layoutsDir: path.join(__dirname),
    partialsDir: path.join(__dirname)
}))
app.set('view engine', '.hbs')
app.set('views', path.join(__dirname))

/**
 * Initialize MiddleWares
 * */
app.use(allowCrossDomain);
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

/***
 * Init Logging
 */
app.use(logger.scribe.express.logger());
//app.use('\logs', logger.scribe.webPanel());

/***
 * Load Authentication module along with its routes
 */
require('./authentication').init(app);

/***
 * Load User Management module along with its routes
 */
require('./userManagement').init(app);

module.exports = app
