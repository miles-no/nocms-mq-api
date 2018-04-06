

const amqp = require('amqp');
const uuid = require('uuid/v4');

const TIMEOUT = 30000;

const msgConfig = { mandatory: true, contentType: 'application/json' };
const exchangeConfig = { durable: true, type: 'fanout' };
const queueConfig = { autoDelete: false };

const eventHandlers = {
  error: [],
  end: [],
  connection: [],
  close: [],
  message: [],
};

let connection = null;
let exchange = null;
let api = null;
let queue = null;
let config = null;
let extLogger = null;
let checkHeartbeatTimeout = null;
let heartbeatTimeoutValue = 10; // seconds
let lastHeartbeatTimestamp = null;

const messageHandlers = {};
const responseFunctions = {};

const logger = (log) => {
  extLogger = log;
  return api;
};

const heartbeatTimeout = (value) => {
  heartbeatTimeoutValue = value;
  return api;
};

const trigger = (eventType, data, msg) => {
  try {
    eventHandlers[eventType].forEach((handler) => { return handler(data, msg); });
  } catch (e) {
    console.error(`Exception thrown in handler of event type ${eventType}`, e);
    trigger('error', e);
  }
};

const subscribe = (msg, handler) => {
  if (!messageHandlers[msg]) {
    messageHandlers[msg] = [];
  }
  messageHandlers[msg].push(handler);
  return api;
};

const log = (msg) => {
  const hasLogger = !!extLogger;
  if (!hasLogger) return;

  if (typeof extLogger === 'function') {
    extLogger(`mq-client: ${msg}`);
  } else {
    console.warn('Logger is not a function');
  }
};

const clearCheckHeartbeatTimeout = () => {
  if (checkHeartbeatTimeout !== null) {
    clearTimeout(checkHeartbeatTimeout);
    checkHeartbeatTimeout = null;
  }
}

const startCheckHeartbeatTimeout = () => {
  log(`Setting timeout to check if next heartbeat happens within ${config.heartbeat + heartbeatTimeoutValue} seconds`);

  clearCheckHeartbeatTimeout();
  checkHeartbeatTimeout = setTimeout(() => {
    trigger('error', 'heartbeat missed');
    connection.reconnect();
  }, (config.heartbeat + heartbeatTimeoutValue) * 1000);
};

const connect = (cfg) => {
  if (connection !== null) {
    return api;
  }

  config = cfg;

  connection = amqp.createConnection(config);
  connection.on('error', (err) => {
    clearCheckHeartbeatTimeout();
    trigger('error', err);
    log(err);
  });

  connection.on('close', () => {
    clearCheckHeartbeatTimeout();
    trigger('close', 'Connection closed');
    log('Connection closed');
  });

  connection.on('end', () => {
    log('Connection ended');
  });

  connection.on('timeout', () => {
    log('Connection timeout');
  });

  connection.on('drain', () => {
    log('Connection drain');
  });

  connection.on('connect', () => {
    log('Connection connect');
  });

  connection.on('secureConnect', () => {
    log('Connection secureConnect');
  });

  connection.on('heartbeat', () => {
    const now = Date.now();
    log(`Connection heartbeat. Time since last ${now - lastHeartbeatTimestamp} ms`);
    lastHeartbeatTimestamp = now;
    startCheckHeartbeatTimeout();
  });

  connection.on('ready', () => {
    log('Ready');
    if (config.heartbeat) {
      log('Using heartbeat');
      lastHeartbeatTimestamp = Date.now();
      startCheckHeartbeatTimeout();
    }

    connection.exchange(config.exchange, exchangeConfig,
      (_exchange) => {
        exchange = _exchange;
        connection.queue(config.queue, queueConfig, (q) => {
          trigger('connection', `Connected to RabbitMQ exchange ${config.exchange}, subscribed to ${config.queue}`);
          queue = q;
          queue.bind(exchange, config.queue);
          queue.subscribe((msg) => {
            trigger('message', msg);
            if (messageHandlers[msg.type]) {
              try {
                messageHandlers[msg.type].forEach((handler) => { return handler(msg); });
              } catch (ex) {
                trigger('error', ex);
              }
            }
            if (messageHandlers['*']) {
              try {
                messageHandlers['*'].forEach((handler) => { return handler(msg); });
              } catch (ex) {
                trigger('error', ex);
              }
            }

            if (msg.type === 'response-message') {
              if (responseFunctions[msg.originId]) {
                responseFunctions[msg.originId](msg);
              }
            }
          });
        });
      });
  });
  return api;
};

const send = (message, cb) => {
  const msg = message;

  if (exchange === null) {
    trigger('error', 'Error sending message. Exchange is not ready yet.', msg);
    return;
  }

  if (cb) {
    const originId = msg.originId || uuid();

    msg.responseExpected = true;
    msg.originId = originId;

    const timeoutId = setTimeout(() => {
      cb({ status: 504, message: 'Message timeout' }, null);
      delete responseFunctions[originId];
    }, TIMEOUT);

    responseFunctions[originId] = (responseMsg) => {
      clearTimeout(timeoutId);
      if (responseMsg && responseMsg.response) {
        cb(null, responseMsg.response);
      } else if (responseMsg && responseMsg.data) {
        cb(null, responseMsg.data);
      } else if (responseMsg.error) {
        cb(responseMsg.error, null);
      } else {
        trigger('error', 'Invalid response', responseMsg);
        cb({ status: 500, message: 'Invalid response' });
      }

      delete responseFunctions[originId];
    };
  }
  exchange.publish(config.queue, msg, msgConfig);
  if (config.heartbeat) {
    lastHeartbeatTimestamp = Date.now();
    startCheckHeartbeatTimeout();
  }
};

const eventHandler = (eventType, cb) => {
  if (!eventHandlers[eventType]) {
    const err = { message: 'Invalid event. Only \'error\', \'connection\' and \'end\' is supported' };
    throw err;
  }

  eventHandlers[eventType].push(cb);
  return api;
};

const respond = (originalMsg, error, response) => {
  const responseMsg = {
    type: 'response-message',
    originId: originalMsg.originId,
    created: (new Date()).toISOString(),
  };
  responseMsg.error = error;
  responseMsg.response = response;
  send(responseMsg);
};

api = {
  connect,
  subscribe,
  send,
  respond,
  logger,
  on: eventHandler,
  heartbeatTimeout,
};

module.exports = api;
