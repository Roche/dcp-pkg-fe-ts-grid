module.exports = {
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
        '^.+\\.jsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    },
    testMatch: [
        "**/__tests__/**/*.test.ts"
    ],
    moduleNameMapper: {
        // Sources import siblings with a `.js` suffix (NodeNext ESM); map them back to the .ts files.
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^lodash-es$': 'lodash'
    },
    transformIgnorePatterns: [
        'node_modules/(?!@open-dcp)',
    ],
};
