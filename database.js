const Sequelize = require('sequelize')

const { DB } = require('./config')

// Setup database connection
const logDB = new Sequelize(DB.NAME, DB.USER, DB.PASSWORD, {
  host: DB.HOST,
  dialect: DB.DIALECT,
  dialectOptions: {
    timezone: DB.TIMEZONE,
  },
  logging: () => {},
})

const Log = logDB.import('./Log')

module.exports = {
  logDB,
  Log,
};
