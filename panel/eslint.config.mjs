import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 se distribuye ya como flat config, así que se importa
 * directamente. El envoltorio con FlatCompat que generaba create-next-app para
 * la 15 ya no hace falta y de hecho falla: al serializar el config nuevo
 * encuentra una referencia circular entre plugins.
 */
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
