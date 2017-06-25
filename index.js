const app = require('./app');
const appPort = process.env.PORT || 5050;
const dbPort = 5984;

app.listen(appPort, function (err) {
    if (err) {
        console.error("D-Care Server failed to start on on Port:" + appPort);
        throw err
    }    
    console.log("D-Care Server is listening on Port:" + appPort);
});

// DB Initialization
var PouchDB = require('pouchdb');
var PouchDBStore = PouchDB.defaults({
    prefix: 'Databases/'
});
var PouchDBServer = require('express-pouchdb')({
    mode: 'fullCouchDB',
    configPath: 'Databases/config.json',
    overrideMode: {
        include: ['routes/fauxton']
    }
});
PouchDBServer.setPouchDB(PouchDBStore);
PouchDBServer.listen(dbPort, function (err) {
    if (err) {
        console.error("D-Care DB Server failed to start on on Port:" + dbPort);
        throw err
    }
    console.log("D-Care DB Server is listening on Port:" + dbPort);
});