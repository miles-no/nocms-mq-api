'use strict';

const test = require('tape');
const sut = require('../');

const setup = () => {
  const fixtures = {};
  return fixtures;
};

const tearDown = () => {

};

test('connection not ready', (t) => {
  t.plan(1);
  sut.on('error', (error, msg) => {
    t.pass('Error event was raised when connection not ready');
  });
  sut.send({ type: 'test-message' }, (err, res) => {
    t.fail('Should fail as connection is not established');
  });
});
