// In-process event bus. server.js emits 'api:change' after every successful change request
// ({ method, path, params-free path, body, user, status, result }), so features such as push
// notifications can react to what happened without editing every module.
const { EventEmitter } = require('events');
const bus = new EventEmitter();
bus.setMaxListeners(50);
module.exports = bus;
