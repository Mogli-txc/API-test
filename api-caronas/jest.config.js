module.exports = {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: './tests/setup.js', // Cria usuário de teste antes de qualquer worker
  forceExit: true                  // Fecha servidor HTTP e pool abertos após os testes
};