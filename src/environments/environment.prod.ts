/**
 * Production environment configuration
 * 
 * Environment variables are injected at build time via webpack DefinePlugin.
 * Vercel environment variables are read during the build process.
 * Fallback values are used when environment variables are not set.
 */
export const environment = {
  production: true,
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
  enableAnalytics: true,
  
  // Logo Configuration (supports both uppercase and lowercase env var names)
  logoUrl: process.env['LOGO_URL'] || process.env['logo_url'] || '',
  
  // Team Code Configuration (supports both uppercase and lowercase env var names)
  supervisorTeamCode: process.env['SUPERVISOR_TEAM_CODE'] || process.env['supervisor_team_code'] || 'Fkmdmko',
  gestorTeamCode: process.env['GESTOR_TEAM_CODE'] || process.env['gestor_team_code'] || 'FkmdnFU',
  diretorTeamCode: process.env['DIRETOR_TEAM_CODE'] || process.env['diretor_team_code'] || 'FkmdhZ9',

  // Supabase (companies / Carteira)
  supabaseUrl: process.env['SUPABASE_URL'] || process.env['supabase_url'] || '',
  supabaseAnonKey: process.env['SUPABASE_ANON_KEY'] || process.env['supabase_anon_key'] || '',
  supabaseProjectId: process.env['SUPABASE_PROJECT_ID'] || process.env['supabase_project_id'] || '',
  supabaseCompaniesTable:
    process.env['SUPABASE_COMPANIES_TABLE'] || process.env['supabase_companies_table'] || 'companies',

  supabaseDbSchema:
    process.env['SUPABASE_DB_SCHEMA'] || process.env['supabase_db_schema'] || 'public',

  supabaseUseMock:
    process.env['SUPABASE_USE_MOCK'] === 'true' ||
    process.env['supabase_use_mock'] === 'true' ||
    !(
      (process.env['SUPABASE_URL'] || process.env['supabase_url'] || '').trim() &&
      (process.env['SUPABASE_ANON_KEY'] || process.env['supabase_anon_key'] || '').trim()
    ),

  supabaseMockFeedAllUsers:
    process.env['SUPABASE_MOCK_FEED_ALL_USERS'] !== 'false' &&
    process.env['supabase_mock_feed_all_users'] !== 'false',

  gamificacaoApiUrl: (
    process.env.GAMIFICACAO_API_URL ||
    process.env.gamificacao_api_url ||
    'https://hook.bwa.global:3334/gamificacao'
  ).trim(),
  gamificacaoApiToken: (
    process.env.GAMIFICACAO_API_TOKEN ||
    process.env.gamificacao_api_token ||
    ''
  ).trim()
};
