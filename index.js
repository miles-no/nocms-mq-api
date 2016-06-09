'use strict';

const amqp = require('amqp');

let connection;
let api = null;

const messageHandlers = {};

const subscribe = (msg, handler) => {
  if (!messageHandlers[msg]) {
    messageHandlers[msg] = [];
  }
  messageHandlers[msg].push(handler);
  return api;
};

const connect = (config) => {
  const exchangeConfig = {
    durable: true,
    type: 'fanout',
  };
  const queueConfig = { autoDelete: false };

  connection = amqp.createConnection(config);
  connection.on('error', (err) => {
    console.error('Connection error', err);
  });

  connection.on('ready', () => {
    connection.exchange(config.exchange, exchangeConfig,
      (exchange) => {
        connection.queue(config.queue, queueConfig, (q) => {
          console.info('Connected to mq. Listening...');

          q.bind(exchange, config.queue);
          q.subscribe((msg) => {
            if (messageHandlers[msg.type]) {
              messageHandlers[msg.type].forEach((handler) => handler(msg));
            }
          });
        });
      });
  });
  return api;
};

api = {
  connect,
  subscribe,
};

module.exports = api;
