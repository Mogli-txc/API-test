// expo-server-sdk é ESM puro e quebra o Jest (transform vazio). Substituído por
// stub em todos os projetos — o envio de push já é no-op em NODE_ENV=test.
const MOCK_EXPO = {
  '^expo-server-sdk$': '<rootDir>/tests/__mocks__/expo-server-sdk.js',
};

const COMMON = {
  testEnvironment:      'node',
  transform:            {},
  moduleFileExtensions: ['js'],
  setupFilesAfterEnv:   ['<rootDir>/tests/workerTeardown.js'],
  moduleNameMapper:     { ...MOCK_EXPO },
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
        ...MOCK_EXPO,
        'geocodingService$': '<rootDir>/tests/__mocks__/geocodingService.js'
      },
    },
  ],
};