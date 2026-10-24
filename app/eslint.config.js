import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default [
  {ignores:['dist/**','node_modules/**','src-tauri/**','src/vendor/**','*.tsbuildinfo']},
  {files:['src/**/*.{ts,tsx}'],languageOptions:{parser:ts.parser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},plugins:{'@typescript-eslint':ts.plugin,'react-hooks':hooks},rules:{
    'no-debugger':'error','no-constant-binary-expression':'error','no-dupe-args':'error','no-duplicate-case':'error','no-unreachable':'error','valid-typeof':'error',
    'react-hooks/rules-of-hooks':'error',
  }},
  {files:['scripts/**/*.cjs'],languageOptions:{ecmaVersion:'latest',sourceType:'commonjs'},rules:{'no-debugger':'error','no-duplicate-case':'error','no-unreachable':'error','valid-typeof':'error'}},
];
