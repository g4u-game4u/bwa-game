/**
 * Homologation/Staging environment configuration
 * 
 * Environment variables are injected at build time via webpack DefinePlugin.
 * Vercel environment variables are read during the build process.
 * Fallback values are used when environment variables are not set.
 */
export const environment = {
  production: false,
  client_id: process.env['CLIENT_ID'] || process.env['client_id'] || 'bwa',
  backend_url_base: process.env['BACKEND_URL_BASE'] || process.env['backend_url_base'] || '',
  
  // Funifier API Configuration
  funifier_api_url: 'https://service2.funifier.com/v3/',
  funifier_api_key: process.env['FUNIFIER_API_KEY'] || process.env['funifier_api_key'] || '690a785ce179d46fce59ed65',
  funifier_base_url: process.env['FUNIFIER_BASE_URL'] || process.env['funifier_base_url'] || 'https://service2.funifier.com/v3/',
  funifier_basic_token: process.env['FUNIFIER_BASIC_TOKEN'] || process.env['funifier_basic_token'] || 'NjkwYTc4NWNlMTc5ZDQ2ZmNlNTllZDY1OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==',
  
  // Cache Configuration
  cacheTimeout: 300000, // 5 minutes in milliseconds
  
  // Feature Flags
  enableAnalytics: false,
  
  // Logo Configuration (supports both uppercase and lowercase env var names)
  logoUrl: process.env['LOGO_URL'] || process.env['logo_url'] || '',
  
  // Team Code Configuration (supports both uppercase and lowercase env var names)
  supervisorTeamCode: process.env['SUPERVISOR_TEAM_CODE'] || process.env['supervisor_team_code'] || 'Fkmdmko',
  gestorTeamCode: process.env['GESTOR_TEAM_CODE'] || process.env['gestor_team_code'] || 'FkmdnFU',
  diretorTeamCode: process.env['DIRETOR_TEAM_CODE'] || process.env['diretor_team_code'] || 'FkmdhZ9',

  financeiroOmieRecebiveis: {
    painelJsonUrl: process.env['FINANCEIRO_OMIE_PAINEL_JSON_URL'] || process.env['financeiro_omie_painel_json_url'] || '',
    caixaJsonUrl: process.env['FINANCEIRO_OMIE_CAIXA_JSON_URL'] || process.env['financeiro_omie_caixa_json_url'] || '',
    categoriasCodigos: process.env['PAINEL_CATEGORIAS'] || process.env['painel_categorias'] || '',
    categoriasDesc: process.env['PAINEL_CATEGORIAS_DESC'] || process.env['painel_categorias_desc'] || ''
  }
};
