module.exports = {
  SENSOR_PIN: 37, // GPIO 25, Pin 37
  IPV6_TARGET: '',
  PUSHBULLET_API_URL: '',
  PUSHBULLET_API_KEY: '',
  TIMEZONE: 'Europe/Stockholm',
  DATE_FORMAT: 'ddd, Do MMM Y',
  TIME_FORMAT: 'HH:mm:ss z',
  DB: {
    HOST: '127.0.0.1',
    NAME: 'z_door_sensor',
    USER: 'user',
    PASSWORD: 'password',
    DIALECT: 'mariadb',
    TIMEZONE: 'Etc/GMT0',
  },
}
