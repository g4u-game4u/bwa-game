import { readBackendUrlBaseFromProcessEnv } from './backend-url';

/** Treats common “off” spellings; dotenv values are always strings at build time. */
function supabaseMockExplicitlyDisabled(
  a: string | undefined,
  b: string | undefined
): boolean {
  const isOff = (v: string | undefined): boolean => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'false' || s === '0' || s === 'no' || s === 'off';
  };
  return isOff(a) || isOff(b);
}

export const environment = {
  production: false,
  // client_id: 'cidadania4u',
  client_id: process.env['CLIENT_ID'] || process.env['client_id'],
  // backend_url_base: 'https://integrador-n8n.grupo4u.com.br/webhook/game4u/taxall',
  backend_url_base: readBackendUrlBaseFromProcessEnv(),
  // backend_url_base: 'https://g4u-mvp-api.onrender.com',
  // backend_url_base: 'https://g4u-mvp-api-staging.onrender.com',
  // backend_url_base: 'https://g4u-mvp-api-1.onrender.com',
  // backend_url_base: 'http://194.163.158.136:1935'
  
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

  // Supabase — filled from .env via custom-webpack DefinePlugin when running ng serve / build
  supabaseUrl: process.env['SUPABASE_URL'] || process.env['supabase_url'] || '',
  supabaseAnonKey: process.env['SUPABASE_ANON_KEY'] || process.env['supabase_anon_key'] || '',
  /**
   * Opcional. Preferir RLS + anon no browser; service role no bundle = risco (ignora RLS).
   * Aceita SUPABASE_SERVICE_ROLE_SECRET (nome pedido no projeto) ou KEY.
   */
  supabaseServiceRoleKey: (
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['supabase_service_role_key'] ||
    process.env['SUPABASE_SERVICE_ROLE_SECRET'] ||
    process.env['supabase_service_role_secret'] ||
    ''
  ).trim(),

  /** Tabelas PostgREST para fallback de `/game/actions` e `/game/stats` (agregação no cliente). */
  supabaseGameUserActionsTable:
    process.env['SUPABASE_GAME_USER_ACTIONS_TABLE'] ||
    process.env['supabase_game_user_actions_table'] ||
    'user_actions',
  supabaseGameDeliveriesTable:
    process.env['SUPABASE_GAME_DELIVERIES_TABLE'] ||
    process.env['supabase_game_deliveries_table'] ||
    'deliveries',
  /** Coluna para filtrar time em fallback (ex.: team_id ou team_name). */
  supabaseGameTeamFilterColumn:
    process.env['SUPABASE_GAME_TEAM_FILTER_COLUMN'] ||
    process.env['supabase_game_team_filter_column'] ||
    'team_id',
  /** Coluna do email do utilizador nas tabelas de jogo (ex.: user_email). */
  supabaseGameUserEmailColumn:
    process.env['SUPABASE_GAME_USER_EMAIL_COLUMN'] ||
    process.env['supabase_game_user_email_column'] ||
    'user_email',
  supabaseProjectId: process.env['SUPABASE_PROJECT_ID'] || process.env['supabase_project_id'] || '',
  supabaseCompaniesTable:
    process.env['SUPABASE_COMPANIES_TABLE'] || process.env['supabase_companies_table'] || 'companies',

  /** PostgREST schema (e.g. public, game4you). Exposed tables must live in this schema. */
  supabaseDbSchema:
    process.env['SUPABASE_DB_SCHEMA'] || process.env['supabase_db_schema'] || 'public',

  /** Default mock until SUPABASE_USE_MOCK is explicitly false (any case) / 0 / no / off */
  supabaseUseMock: !supabaseMockExplicitlyDisabled(
    process.env['SUPABASE_USE_MOCK'],
    process.env['supabase_use_mock']
  ),

  /** Mock: return all companies to every user (temporary dev UX) */
  supabaseMockFeedAllUsers:
    process.env['SUPABASE_MOCK_FEED_ALL_USERS'] !== 'false' &&
    process.env['supabase_mock_feed_all_users'] !== 'false',

  /** BWA gamificação hook — KPI por empresa (carteira / participação) */
  gamificacaoApiUrl:
    (process.env.GAMIFICACAO_API_URL || process.env.gamificacao_api_url || '')
      .trim() || 'https://hook.bwa.global:3334/gamificacao',
  gamificacaoApiToken: (
    process.env.GAMIFICACAO_API_TOKEN ||
    process.env.gamificacao_api_token ||
    ''
  ).trim(),

  /** Com `backend_url_base` definido: rotas `/game/*` (Game4uApiService, mes-atual, etc.). Se true, dados de gamificação vêm desta API em vez do Funifier/action_log. */
  useGame4uApi:
    String(process.env['GAME4U_USE_API'] ?? process.env['game4u_use_api'] ?? 'true').toLowerCase() !==
    'false',

  /**
   * Só com `true` explícito: fallback HTTP `/game/*` → leitura Supabase (SUPABASE_URL).
   * Painéis jogador/gestor não devem depender disto.
   */
  useGame4uSupabaseFallback:
    String(
      process.env['GAME4U_SUPABASE_FALLBACK'] ?? process.env['game4u_supabase_fallback'] ?? ''
    ).toLowerCase() === 'true'
};
