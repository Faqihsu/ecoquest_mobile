module.exports = {
  // Only run on staged files
  '*.{ts,tsx}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
  ],
  '*.{js,jsx}': [
    'prettier --write',
  ],
  '*.{json,md}': [
    'prettier --write',
  ],
};
