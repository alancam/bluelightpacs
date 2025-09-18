const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    globals: true
  }
});
