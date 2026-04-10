export const environment = {
  production: false,
  // client_id: 'cidadania4u',
  client_id: 'revisaprev',
  // backend_url_base: 'https://integrador-n8n.grupo4u.com.br/webhook/game4u/taxall',
  backend_url_base: 'http://localhost',
  // backend_url_base: 'https://g4u-mvp-api.onrender.com',
  // backend_url_base: 'https://g4u-mvp-api-staging.onrender.com',
  // backend_url_base: 'https://g4u-mvp-api-1.onrender.com',
  // backend_url_base: 'http://194.163.158.136:1935'
  
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
  }
};
