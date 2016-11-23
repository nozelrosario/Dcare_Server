var config = {
    sessionValidity: '10m', // Token Validity (moment js formatting)
    dbAdminCredentials : {
        username: "admin", 
        password: "Admin@Password",
        cookie: ''
    },
    dbUserCredentials : {
        username: "", 
        password: "Us3rP@ssw0rd",
        cookie: ''
    },
    dbHost: 'localhost',
    dbPort: 5984,
    dbHostProtocol: 'http',
    syncedDataStores: ['glucose', 'meals', 'medications', 'notifications', 'patients', 'reminders', 'vitals']    
};

module.exports = config;