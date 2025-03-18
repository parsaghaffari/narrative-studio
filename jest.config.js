module.exports = {
    preset: 'ts-jest', // For TypeScript support
    testEnvironment: 'jsdom', // Simulates the browser environment
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'], // Setup file
    moduleNameMapper: {
      '\\.(css|less|scss|sass)$': 'identity-obj-proxy', // Mock CSS imports
    },
    transform: {
      '^.+\\.tsx?$': 'ts-jest', // Use ts-jest for TypeScript
    },
  };
  