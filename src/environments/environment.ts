export const environment = {
  production: false,
  // client_id: 'cidadania4u',
  client_id: 'revisaprev',
  /**
   * API backend. Com `ng serve`, lê `BACKEND_URL_BASE` ou `backend_url_base` do `.env` (DefinePlugin).
   * Fallback local alinhado à porta padrão da API em desenvolvimento.
   */
  backend_url_base:
    process.env['BACKEND_URL_BASE'] ||
    process.env['backend_url_base'] ||
    'http://localhost:3001',

  /**
   * Base da API Game4U (login em POST /auth/login). Se vazio, usa a mesma ordem de fallback de `backend_url_base`.
   */
  g4u_api_base:
    process.env.G4U_API_BASE ||
    process.env.g4u_api_base ||
    process.env['BACKEND_URL_BASE'] ||
    process.env['backend_url_base'] ||
    'http://localhost:3001',
  
  // Funifier API Configuration
  funifier_api_url: 'https://service2.funifier.com/v3/',
  funifier_api_key: '698f8813434ba0101756e314',
  funifier_base_url: 'https://service2.funifier.com/v3/',
  funifier_basic_token: 'Njk4Zjg4MTM0MzRiYTAxMDE3NTZlMzE0OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==',
  
  // Cache Configuration
  cacheTimeout: 300000, // 5 minutes in milliseconds
  
  // Feature Flags
  enableAnalytics: false,
  
  // Logo Configuration
  logoUrl: '', // Empty string means use default logo
  
  // Team Code Configuration (hardcoded defaults for development)
  supervisorTeamCode: 'Fkmdmko',
  gestorTeamCode: 'FkmdnFU',
  diretorTeamCode: 'FkmdhZ9',
  logo_url: 'https://i.ibb.co/Fk92q8hv/Logo-Revisa-Prev-removebg-preview.png',

  /**
   * Integração Omie — KPI circular "Valor concedido" (time financeiro).
   * Modo A: painelJsonUrl → JSON já processado (omie_painel_recebiveis.json).
   * Modo B: caixaJsonUrl → export bruto; o front aplica as mesmas regras do Python.
   * Sobrescritos por system params homônimos quando preenchidos.
   */
  financeiroOmieRecebiveis: {
    painelJsonUrl: '',
    caixaJsonUrl: '',
    categoriasCodigos: '',
    categoriasDesc: ''
  },

  /**
   * Supabase (projeto RevisaPrev). Com `ng serve`, o webpack injeta `process.env` a partir do `.env`.
   * Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_SECRET.
   * Documentação relacionada ao produto: https://g4u-mvp-api.onrender.com/api#/
   */
  supabaseRevisaprev: {
    url: process.env['SUPABASE_URL'] || process.env['supabase_url'] || '',
    anonKey: process.env['SUPABASE_ANON_KEY'] || process.env['supabase_anon_key'] || '',
    serviceRoleSecret:
      process.env['SUPABASE_SERVICE_ROLE_SECRET'] ||
      process.env['supabase_service_role_secret'] ||
      ''
  }
};
