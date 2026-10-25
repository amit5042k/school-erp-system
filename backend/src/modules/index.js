// Loads every feature module in this folder (files not starting with "_").
// A module creates its tables when required and exports `register(router)` to add its routes.
const fs = require('fs');
const path = require('path');

function moduleFiles() {
  return fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_'))
    .sort();
}

function loadModules() {
  return moduleFiles().map(f => ({ name: f.replace(/\.js$/, ''), mod: require(path.join(__dirname, f)) }));
}

function registerModules(router) {
  for (const { name, mod } of loadModules()) {
    if (typeof mod.register !== 'function') throw new Error(`Module ${name} must export register(router)`);
    mod.register(router);
  }
}

// Some integrations (e.g. biometric devices) must answer outside /api; modules may export registerRoot(app).
function registerRootModules(app) {
  for (const { mod } of loadModules()) if (typeof mod.registerRoot === 'function') mod.registerRoot(app);
}

module.exports = { loadModules, registerModules, registerRootModules };
