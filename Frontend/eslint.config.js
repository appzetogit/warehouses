import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// One rule, on purpose: a name used but never defined only fails when the page
// renders, so the build can't catch it. Several pages crashed that way (seller
// signup, the order invoice). `npm run check` runs this.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'scripts/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    // Registered so existing react-hooks disable comments resolve; its rules stay off.
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'no-undef': 'error' },
  },
]
