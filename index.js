const app = require('./app');
const port = process.env.PORT || 5050;

app.listen(port, function (err) {
    if (err) {
        console.error("D-Care Server failed to start on on Port:" + port);
        throw err
    }    
    console.log("D-Care Server is listening on Port:" + port);
});

//DB
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
PouchDBServer.listen(5984);