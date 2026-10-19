'use strict';

let win = null;

module.exports = { get: () => win, set: (next) => { win = next; } };
