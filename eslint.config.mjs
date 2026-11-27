import antfu from '@antfu/eslint-config'

export default antfu(
  {
    formatters: true,
    vue: true,
  },
  {
    files: ['build/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
)
