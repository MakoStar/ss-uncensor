'use strict';

const { run } = require('./run');
const { doctor } = require('./doctor');

module.exports = { run, verify: run, doctor };
