var scribe = require('scribe-js')();
module.exports = function() {
	return {
	scribe : scribe,
	log : function (message) {
		console.log(message);
	},
	error : function (message) {
		console.error(message);
	},
	info : function (message) {
		console.info(message);
	},
	warn : function (message) {
		console.warning(message);
	}
	};
};

/*
Couls use Winstone also
var winston = require('winston');

var logger = new (winston.Logger)({
transports: [
new (winston.transports.Console)({ json: false, timestamp: true }),
new winston.transports.File({ filename: __dirname + '/debug.log', json: false })
],
exceptionHandlers: [
new (winston.transports.Console)({ json: false, timestamp: true }),
new winston.transports.File({ filename: __dirname + '/exceptions.log', json: false })
],
exitOnError: false
});*/