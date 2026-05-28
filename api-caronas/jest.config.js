const COMMON = {
  testEnvironment:      'node',
  transform:            {},
  moduleFileExtensions: ['js'],
  setupFilesAfterEnv:   ['<rootDir>/tests/workerTeardown.js'],
};

module.exports = {
  globalSetup: './tests/setup.js',  // roda uma vez, antes de todos os workers
  forceExit:   true,                // garante saída mesmo se teardown falhar

  projects: [
    // ── Geocoding: usa o serviço real (mocka fetch internamente) ─────────────
    {
      ...COMMON,
      displayName: 'geocoding',
      testMatch:   ['<rootDir>/tests/geocoding.test.js'],
    },

    // ── Demais testes: geocodingService substituído por mock fixo ────────────
    {
      ...COMMON,
      displayName:          'main',
      testMatch:            ['<rootDir>/tests/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/tests/geocoding.test.js'],
      moduleNameMapper: {
        'geocodingService$': '<rootDir>/tests/__mocks__/geocodingService.js'
      },
    },
  ],
};