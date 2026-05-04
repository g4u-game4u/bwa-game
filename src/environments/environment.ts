const _proc = typeof process !== 'undefined' ? process : { env: {} as Record<string, string | undefined> };

// Debug: Log what webpack injected
console.log('🔍 Environment Debug:', {
  'process.env.BACKEND_URL_BASE': _proc.env['BACKEND_URL_BASE'],
  'process.env.backend_url_base': _proc.env['backend_url_base'],
  'process.env.G4U_API_BASE': _proc.env['G4U_API_BASE'],
  'process.env.g4u_api_base': _proc.env['g4u_api_base'],
  'process.env.USE_API_PROXY': _proc.env['USE_API_PROXY']
});

const useApiProxyFlag = (() => {
  const v = String(_proc.env.USE_API_PROXY ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
})();

export const environment = {
  production: false,
  // client_id: 'cidadania4u',
  client_id: 'revisaprev',
  /**
   * API backend. Com `ng serve`, lê `BACKEND_URL_BASE` ou `backend_url_base` do `.env` (DefinePlugin).
   * CORS no browser: no `.env` use `USE_API_PROXY=true` e base vazia — os pedidos vão para o mesmo host do `ng serve`
   * e o `proxy.conf.json` encaminha para a API (ex. :3001).
   */
  backend_url_base: useApiProxyFlag
    ? ''
    : _proc.env['BACKEND_URL_BASE'] ||
      _proc.env['backend_url_base'] ||
      'http://localhost:3001',

  /**
   * Base da API Game4U (login em POST /auth/login). Com `USE_API_PROXY=true`, deixe implícito vazio (mesmo host + proxy).
   */
  g4u_api_base: useApiProxyFlag
    ? ''
    : _proc.env.G4U_API_BASE ||
      _proc.env.g4u_api_base ||
      _proc.env['BACKEND_URL_BASE'] ||
      _proc.env['backend_url_base'] ||
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
   * ID fixo do goal template para o KPI «Valor concedido» (logs em /goals/logs).
   * Variáveis: RECEITA_CONCEDIDA_GOAL_TEMPLATE_ID ou receita_concedida_goal_template_id no `.env` (build).
   */
  receitaConcedidaGoalTemplateId:
    _proc.env['RECEITA_CONCEDIDA_GOAL_TEMPLATE_ID'] ||
    _proc.env['receita_concedida_goal_template_id'] ||
    '',

  /**
   * Supabase (projeto RevisaPrev). Com `ng serve`, o webpack injeta `_proc.env` a partir do `.env`.
   * Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_SECRET.
   * Documentação relacionada ao produto: https://g4u-mvp-api.onrender.com/api#/
   */
  supabaseRevisaprev: {
    url: _proc.env['SUPABASE_URL'] || _proc.env['supabase_url'] || '',
    anonKey: _proc.env['SUPABASE_ANON_KEY'] || _proc.env['supabase_anon_key'] || '',
    serviceRoleSecret:
      _proc.env['SUPABASE_SERVICE_ROLE_SECRET'] ||
      _proc.env['supabase_service_role_secret'] ||
      ''
  }
};

// Debug: Log final environment values
console.log('✅ Final Environment Values:', {
  backend_url_base: environment.backend_url_base,
  g4u_api_base: environment.g4u_api_base,
  useApiProxyFlag
});
