/** Keys injected by custom-webpack DefinePlugin (browser bundle). */
declare namespace NodeJS {
  interface ProcessEnv {
    BACKEND_URL_BASE?: string;
    G4U_API_BASE?: string;
    backend_url_base?: string;
    g4u_api_base?: string;
    GAMIFICACAO_API_URL?: string;
    GAMIFICACAO_API_TOKEN?: string;
    gamificacao_api_url?: string;
    gamificacao_api_token?: string;
  }
}
