const app = require('./app')
const port = process.env.PORT || 5050

app.listen(port, function (err) {
  if (err) {
    throw err
  }

    console.log("D-Care Server is listening on Port:" + port);
})
