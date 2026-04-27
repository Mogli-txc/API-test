module.exports = {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: './tests/setup.js',                        // Cria usuário de teste antes de qualquer worker
  setupFilesAfterEnv: ['./tests/workerTeardown.js'],      // Fecha pool MySQL em cada worker após os testes
  forceExit: true                                         // Fallback: garante saída mesmo se teardown falhar
};