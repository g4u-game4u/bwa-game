/** Variáveis injetadas em build (custom-webpack DefinePlugin). */
declare namespace NodeJS {
  interface ProcessEnv {
    G4U_API_BASE?: string;
    g4u_api_base?: string;
  }
}
