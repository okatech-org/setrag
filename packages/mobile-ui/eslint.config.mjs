import js from "@eslint/js"
import react from "eslint-plugin-react"
import tseslint from "typescript-eslint"

/* Le paquet n'avait aucun lint : des sous-composants définis pendant le rendu
   y sont passés inaperçus, alors que la même faute était détectée dans l'app. */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "react/no-unstable-nested-components": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
)
