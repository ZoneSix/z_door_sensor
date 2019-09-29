const { logDB } = require('./database')

// Force sync database
logDB.sync({
  force: true
}).then(_ => {
  console.info('Database synchronized!')
})
