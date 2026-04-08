/** Keys injected by custom-webpack DefinePlugin (browser bundle). */
declare namespace NodeJS {
  interface ProcessEnv {
    GAMIFICACAO_API_URL?: string;
    GAMIFICACAO_API_TOKEN?: string;
    gamificacao_api_url?: string;
    gamificacao_api_token?: string;
  }
}
