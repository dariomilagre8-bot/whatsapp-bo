/** Jest: apenas pipeline QA (integration + flows + unit/pipeline). Testes legacy continuam em `npm run test:legacy`. */
module.exports = {
  testEnvironment: 'node',
  roots: [
    '<rootDir>/engine/tests/integration',
    '<rootDir>/engine/tests/flows',
    '<rootDir>/engine/tests/unit/pipeline',
  ],
  testMatch: ['**/*.test.js'],
  maxWorkers: 1,
  testTimeout: 60000,
  forceExit: true,
};
