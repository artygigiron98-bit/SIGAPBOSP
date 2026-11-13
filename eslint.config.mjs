import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'public/**/*', 'scripts/**/*', 'lib/**/*', 'server.js']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
