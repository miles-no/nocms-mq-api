# NoCMS MQ Api

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Dependency Status](https://david-dm.org/miles-no/nocms-mq-api.svg)](https://david-dm.org/miles-no/nocms-mq-api)
[![devDependencies](https://david-dm.org/miles-no/nocms-mq-api/dev-status.svg)](https://david-dm.org/miles-no/nocms-mq-api?type=dev)


## Commit message format and publishing

This repository is published using `semantic-release`, with the default [AngularJS Commit Message Conventions](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit).

Fluent API for handling rabbit mq messaging in NoCMS.


## Installation

```
npm install nocms-events --save
```

## Examples

### Send a message

```
const mq = require('mq');

// Send a message of certain type
const msgObj = {
  data: { foo: 'Foo' }
};

mq.send('my-message', msgObj);
```

### Subscription

```
mq.connect(config)
  .subscribe('my-message', (msg) => {
    console.log(msg.data.foo); // --> Foo
  });

```

### Responding

This example has a handler responding to ping messages with the value pong and the other way around.

```
mq.connect(config)
  .subscribe('ping-message', (msg) => {
    const response = { value: msg.data.value === 'ping' ? 'ping' : 'pong' };
    mq.respond(msg, null, response)
  });

const pingMsg = {
  data: value: 'ping',
};

const responseHandler = (err, response) => {
  console.log(response.value); // --> pong
};

mq.send('ping-message', pingMsg, responseHandler);
mq.respond(msg, null, response)
```

## The Message Object

```
{
  type: 'Name of message type',
  userToken: 'An optional token for identifying an end user',
  adminToken: 'An optional token identifying a NoCMS user',
  data: 'An object or value representing the message payload',
  originId: 'A generated read only guid for a message'
}
```

## API

### connect, (config)
Establish connection to and AMQP server.
config = {
  host: Address to the server,
  login: mq user name,
  password: mq password,
  vhost: mq vhost,
  exchange: name of the exchange to connect to,
  queue: name of the queue to subscribe to
}

### send, (messageObj, [callback])
Publishes message of type `messageName` on the queue.

If callback is provided, this will be called if a response message is returned.

### subscribe, (messageName, handlerFunction)
Subscribe to a message of a certain type. The handler function will be invoked with the message object as a single argument.

### respond, (originalMessage, error, response)
The respond function takes the original message object and publishes a new message of type `response-message` referencing the original message by it's originId.

### Events: on, (eventType, callback)
Add event handlers using the `api.on` function.

#### connection, (summary)
Triggers when connection to the exchange is established.

#### close, (summary)
Triggers when the connection to the mq is closed.

#### error, (err)
Triggers on transport errors and logical errors.

#### message, (msg)
Triggers every time a message is sent to the queue.
