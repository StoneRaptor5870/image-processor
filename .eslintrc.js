module.exports = {
  extends: ['airbnb-base', 'plugin:prettier/recommended', 'prettier'],
  rules: {
    'no-await-in-loop': 'off',
    'consistent-return': 'off',
    'no-console': 'off',
    'no-shadow': 'warn',
    'no-use-before-define': 'error',
    'no-restricted-syntax': 'off',
    'prettier/prettier': ['error', { semi: false }],
  },
}
