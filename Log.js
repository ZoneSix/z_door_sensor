module.exports = (Sequelize, DataTypes) => {
  return Sequelize.define('log', {

    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },

    event: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    eventTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    eventTimeUNIX: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    phoneConnected: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    }

  })
}
