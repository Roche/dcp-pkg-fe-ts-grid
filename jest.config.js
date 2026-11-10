module.exports = {
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
        '^.+\\.jsx?$': 'ts-jest',
    },
    testMatch: [
        "**/__tests__/**/*.test.ts"
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^lodash-es$': 'lodash'
    },
    transformIgnorePatterns: [
        'node_modules/(?!@open-dcp)',
    ],
};