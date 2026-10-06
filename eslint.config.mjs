import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['build/**','node_modules/**','artifacts/**']},...tseslint.configs.recommended,{files:['scripts/**/*.mjs'],languageOptions:{globals:{process:'readonly',console:'readonly',Buffer:'readonly',setTimeout:'readonly'}}});
