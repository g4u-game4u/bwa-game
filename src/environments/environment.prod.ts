import { readBackendUrlBaseFromProcessEnv } from './backend-url';

/**
 * Production environment configuration
 * 
 * Environment variables are injected at build time via webpack DefinePlugin.
 * Vercel environment variables are read during the build process.
 * Fallback values are used when environment variables are not set.
 */
export const environment = {
  production: true,
  client_id: process.env['CLIENT_ID'] || process.env['client_id'],
  backend_url_base: readBackendUrlBaseFromProcessEnv({ rejectLoopback: true }),
  
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

  // Supabase (companies / Carteira) — URL vazia no bundle (sem projeto remoto injetado aqui).
  supabaseUrl: '',
  supabaseAnonKey: process.env['SUPABASE_ANON_KEY'] || process.env['supabase_anon_key'] || '',
  supabaseServiceRoleKey: (
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['supabase_service_role_key'] ||
    process.env['SUPABASE_SERVICE_ROLE_SECRET'] ||
    process.env['supabase_service_role_secret'] ||
    ''
  ).trim(),
  supabaseProjectId: process.env['SUPABASE_PROJECT_ID'] || process.env['supabase_project_id'] || '',
  supabaseCompaniesTable:
    process.env['SUPABASE_COMPANIES_TABLE'] || process.env['supabase_companies_table'] || 'companies',

  supabaseDbSchema:
    process.env['SUPABASE_DB_SCHEMA'] || process.env['supabase_db_schema'] || 'public',

  supabaseUseMock:
    process.env['SUPABASE_USE_MOCK'] === 'true' ||
    process.env['supabase_use_mock'] === 'true' ||
    !(process.env['SUPABASE_ANON_KEY'] || process.env['supabase_anon_key'] || '').trim(),

  supabaseMockFeedAllUsers:
    process.env['SUPABASE_MOCK_FEED_ALL_USERS'] !== 'false' &&
    process.env['supabase_mock_feed_all_users'] !== 'false',

  supabaseGameUserActionsTable:
    process.env['SUPABASE_GAME_USER_ACTIONS_TABLE'] ||
    process.env['supabase_game_user_actions_table'] ||
    'user_actions',
  supabaseGameDeliveriesTable:
    process.env['SUPABASE_GAME_DELIVERIES_TABLE'] ||
    process.env['supabase_game_deliveries_table'] ||
    'deliveries',
  supabaseGameTeamFilterColumn:
    process.env['SUPABASE_GAME_TEAM_FILTER_COLUMN'] ||
    process.env['supabase_game_team_filter_column'] ||
    'team_id',
  supabaseGameUserEmailColumn:
    process.env['SUPABASE_GAME_USER_EMAIL_COLUMN'] ||
    process.env['supabase_game_user_email_column'] ||
    'user_email',

  gamificacaoApiUrl: (
    process.env.GAMIFICACAO_API_URL ||
    process.env.gamificacao_api_url ||
    'https://hook.bwa.global:3334/gamificacao'
  ).trim(),
  gamificacaoApiToken: (
    process.env.GAMIFICACAO_API_TOKEN ||
    process.env.gamificacao_api_token ||
    ''
  ).trim(),

  useGame4uApi:
    String(process.env['GAME4U_USE_API'] ?? process.env['game4u_use_api'] ?? 'true').toLowerCase() !==
    'false',

  useGame4uSupabaseFallback:
    String(
      process.env['GAME4U_SUPABASE_FALLBACK'] ?? process.env['game4u_supabase_fallback'] ?? ''
    ).toLowerCase() === 'true',

  /** Aviso fixo de manutenção. Desligar: SHOW_MAINTENANCE_BANNER=false */
  showMaintenanceBanner:
    String(
      process.env['SHOW_MAINTENANCE_BANNER'] ?? process.env['show_maintenance_banner'] ?? 'true'
    )
      .trim()
      .toLowerCase() !== 'false'
};
