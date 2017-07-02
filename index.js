const app = require('./app');
const appPort = process.env.PORT || 5050;
const dbPort = 5984;
var cmdLineArgs, PouchDB, PouchDBStore, PouchDBServer;
//NR: Setup commandline arguments values with its defaults
cmdLineArgs = {
    //'argumentName': { 'value': 'defaultValue' },
    'nodb': { 'value': false }
};
process.argv.forEach(function (val, index, array) {
    //console.log(index + ': ' + val);
    if (cmdLineArgs && cmdLineArgs[val]) {
        cmdLineArgs[val].value = true;
    }
});

app.listen(appPort, function (err) {
    if (err) {
        console.error("D-Care Server failed to start on on Port:" + appPort);
        throw err
    }    
    console.log("D-Care Server is listening on Port:" + appPort);
});

// DB Initialization
if (!cmdLineArgs.nodb.value) {
    PouchDB = require('pouchdb');
    PouchDBStore = PouchDB.defaults({
        prefix: 'Databases/'
    });
    PouchDBServer = require('express-pouchdb')({
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
}