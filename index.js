'use strict';

const amqp = require('amqp');
const uuid = require('uuid');

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

const messageHandlers = {};
const responseFunctions = {};

const trigger = (eventType, data, msg) => {
  eventHandlers[eventType].forEach(handler => handler(data, msg));
};

const subscribe = (msg, handler) => {
  if (!messageHandlers[msg]) {
    messageHandlers[msg] = [];
  }
  messageHandlers[msg].push(handler);
  return api;
};

const connect = (cfg) => {
  if (connection !== null) {
    return api;
  }

  config = cfg;

  connection = amqp.createConnection(config);
  connection.on('error', (err) => {
    trigger('error', err);
  });

  connection.on('close', () => {
    trigger('close', 'Connection closed');
  });

  connection.on('ready', () => {
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
              messageHandlers[msg.type].forEach(handler => handler(msg));
            }
            if (messageHandlers['*']) {
              messageHandlers['*'].forEach(handler => handler(msg));
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
    const originId = uuid.v4();

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
      } else {
        if (responseMsg.error) {
          cb(responseMsg.error, null);
        } else {
          trigger('error', 'Invalid response', responseMsg);
          cb({ status: 500, message: 'Invalid response' });
        }
      }

      delete responseFunctions[originId];
    };
  }
  exchange.publish(config.queue, msg, msgConfig);
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
  on: eventHandler,
};

module.exports = api;
