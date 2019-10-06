const rpio = require('rpio')
const moment = require('moment-timezone')
const humanElapsed = require('human-elapsed')
const fetch = require('node-fetch')
const ping = require('net-ping')
const nodeWebcam = require('node-webcam')
const fs = require('fs')

const { Log } = require('./database')

const config = require('./config')

const POLLINTERVAL = 1000 // Milliseconds
const {
  SENSOR_PIN: DOORSWITCH,
  PUSHBULLET_API_URL,
  PUSHBULLET_API_KEY,
  TIMEZONE,
  DATE_FORMAT,
  TIME_FORMAT,
  IPV6_TARGET,
  CAMERA,
} = config

// Setup the network ping session
const netSession = ping.createSession({
    networkProtocol: ping.NetworkProtocol.IPv6,
    packetSize: 16,
    retries: 4,
    sessionId: (process.pid % 65535),
    timeout: 2000,
    ttl: 128,
})

// Setup camera
const camera = nodeWebcam.create({
  width: CAMERA.WIDTH,
  height: CAMERA.HEIGHT,
  quality: CAMERA.QUALITY,
  delay: 0,
  saveShots: false,
  output: CAMERA.OUTPUT,
  device: false,
  callbackReturn: 'buffer',
  verbose: false,
})

const cameraData = {
  timer: null,
  location: null,
  count: 0,
  target: CAMERA.DURATION / CAMERA.DELAY,
}

const door = {
  lastState: null,
  lastStateTimeStamp: null,
  pollInterval: null,
}

const msToSeconds = (milliseconds) => Math.round(milliseconds / 1000)

const initialize = () => {
  console.info('Starting Door Sensor...')

  rpio.init({
    gpiomem: false, // Use /dev/gpiomem
    mapping: 'physical', // Use the P1-P40 numbering scheme
  })

  pollDoor()

  console.info('Door Sensor is running.')
}

const pollDoor = () => {
  rpio.open(DOORSWITCH, rpio.INPUT, rpio.PULL_UP) // Setup pin for input
  door.lastState = rpio.read(DOORSWITCH) // Store the current state
  door.lastStateTimeStamp = moment() // Store the current timestamp
  const firstTimeStamp = door.lastStateTimeStamp

  // Get the latest state and timestamp from log
  Log.findOne({
    order: [
      ['eventTimeUNIX', 'DESC'],
    ],
  }).then(entry => {
    if (entry && door.lastStateTimeStamp.valueOf() === firstTimeStamp.valueOf()) {
      door.lastStateTimeStamp = moment(parseInt(entry.eventTimeUNIX, 10))
    }
  })

  // Run polling clock
  door.pollInterval = setInterval(checkDoorState, POLLINTERVAL)
}

const checkDoorState = () => {
  // Get the current state
  const currentState = rpio.read(DOORSWITCH)

  // Check if state has changed
  if (currentState !== door.lastState) {
    door.lastState = currentState
    handleChangedState(currentState)
  }
}

const handleChangedState = (currentState) => {
  const timeStamp = moment()
  const timeDelta = msToSeconds(timeStamp.valueOf() - door.lastStateTimeStamp.valueOf())

  const humanTime = {
    date: timeStamp.tz(TIMEZONE).format(DATE_FORMAT),
    time: timeStamp.tz(TIMEZONE).format(TIME_FORMAT),
    delta: humanElapsed(timeDelta),
  }

  humanTime.dateTime = `${humanTime.date} at ${humanTime.time}`

  // Set last state timestamp
  door.lastStateTimeStamp = timeStamp

  if (currentState) {
    handleDoorOpen({ timeStamp, timeDelta, humanTime })
  } else {
    handleDoorClose({ timeStamp, timeDelta, humanTime })
  }
}

const handleDoorOpen = async (param) => {
  startCapture(param.timeStamp)

  let consolePrint = `${param.humanTime.dateTime}: Door opened!\n`
  consolePrint += `Door was closed for ${param.humanTime.delta}`
  console.log(consolePrint)

  const phoneOnNetwork = await checkNetworkForPhone()

  if (!phoneOnNetwork) {
    abortCapture()
  }

  logToDB({
    event: 'DOOR_OPEN',
    timeStamp: param.timeStamp,
    phoneOnNetwork,
  })

  let notificationBody = `Door was opened on ${param.humanTime.dateTime}\n\n`
  notificationBody += `Door was closed for ${param.humanTime.delta}`

  prepareNotification(phoneOnNetwork, {
    title: 'Door was opened!',
    body: notificationBody,
  })
}

const handleDoorClose = async (param) => {
  let consolePrint = `${param.humanTime.dateTime}: Door closed!\n`
  consolePrint += `Door was open for ${param.humanTime.delta}`
  console.log(consolePrint)

  const phoneOnNetwork = await checkNetworkForPhone()

  logToDB({
    event: 'DOOR_CLOSE',
    timeStamp: param.timeStamp,
    phoneOnNetwork,
  })

  let notificationBody = `Door was closed on ${param.humanTime.dateTime}\n\n`
  notificationBody += `Door was open for ${param.humanTime.delta}`

  prepareNotification(phoneOnNetwork, {
    title: 'Door was closed!',
    body: notificationBody,
  })
}

const logToDB = (param) => {
  Log.create({
    event: param.event,
    eventTime: param.timeStamp.tz(TIMEZONE).format('Y-MM-DD HH:mm:ssZ'),
    eventTimeUNIX: param.timeStamp.valueOf(),
    phoneConnected: param.phoneOnNetwork,
  }).catch(error => {
    console.error(error)
  })
}

const checkNetworkForPhone = () => {
  return new Promise(resolve => {
    netSession.pingHost(IPV6_TARGET, (error, target) => {
      if (error) {
        if (error instanceof ping.RequestTimedOutError) {
          // Not on network
          resolve(false)
          return
        }

        // Error
        console.error(error)
        resolve(null)
        return
      }

      // On network
      resolve(true)
      return
    })
  })
}

const prepareNotification = (phoneOnNetwork, data) => {
  if (!phoneOnNetwork) {
    console.log('Phone is not on the network. Sending notification...')

    sendNotification({
      title: data.title,
      body: data.body,
    })
  } else {
    console.log('Phone is on the network.')
  }
}

const sendNotification = (message) => {
  fetch(`${PUSHBULLET_API_URL}/pushes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': PUSHBULLET_API_KEY,
    },
    body: JSON.stringify({
      type: 'note',
      ...message
    }),
  })
  .then(res => {
    if (res.status === 200) {
      return res.json()
    }

    console.error('Failed to send notification!\n', res.statusText)
  })
  .then(json => {
    if (json.error || !json.iden) {
      console.error('Failed to send notification!\n', json)
      return
    }

    console.log('Notification sent!')
  })
}

const startCapture = (timeStamp) => {
  const time = timeStamp.tz(TIMEZONE).format('Y-MM-DD-HH-mm-ss')
  const path = `${CAMERA.SAVEDIR}/event-${time}`

  cameraData.location = path
  cameraData.count = 0

  // Clear timer if any
  if (cameraData.timer) {
    clearTimeout(cameraData.timer)
  }

  capture(timeStamp)
}

const capture = (timeStamp = null) => {
  const time = timeStamp
    ? timeStamp.tz(TIMEZONE).format('Y-MM-DD-HH-mm-ss')
    : moment().tz(TIMEZONE).format('Y-MM-DD-HH-mm-ss')
  const path = cameraData.location ? cameraData.location : `${CAMERA.SAVEDIR}/event-${time}`
  const file = `capture-${time}`
  const completePath = `${path}/${file}.${CAMERA.OUTPUT}`

  camera.capture(file, (error, buffer) => {
    if (error) {
      console.error(error)
      return
    }

    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, {
        recursive: true,
      })
    }


    fs.writeFile(completePath, buffer, (error) => {
      if (error) {
        console.error(error)
        return
      }

      console.info(`Capture saved to ${completePath}`)
      cameraData.count += 1
    })
  })

  if (cameraData.count < cameraData.target) {
    cameraData.timer = setTimeout(capture, CAMERA.DELAY)
  }
}

const abortCapture = () => {
  if (cameraData.timer) {
    clearTimeout(cameraData.timer)
  }

  if (cameraData.location) {
    fs.rmdir(cameraData.location, {
      recursive: true,
    }, (error) => {
      console.error(error)
    })
  }
}

initialize()
