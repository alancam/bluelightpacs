const fs = require('fs');
const vm = require('vm');

// Loads a browser-oriented JS file into a VM context and returns the context
// so that global functions defined in the file can be accessed for testing
// without modifying the source to use module exports.
module.exports = function loadBrowserFile(filePath, injectedGlobals = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    console,
    // Provide minimal shims so referencing these in non-tested functions doesn't crash
    window: injectedGlobals.window || {},
    document: injectedGlobals.document || {},
    ImageManager: injectedGlobals.ImageManager || {},
    leftLayout: injectedGlobals.leftLayout || {},
    GetViewport: injectedGlobals.GetViewport || (function () { return { scale: 1 }; }),
    ...injectedGlobals,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: filePath });
  return context;
};

