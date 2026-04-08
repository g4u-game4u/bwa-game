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
  client_id: 'revisaprev',
  // backend_url_base: 'https://integrador-n8n.grupo4u.com.br/webhook/game4u/taxall',
  backend_url_base: 'http://localhost',
  // backend_url_base: 'https://g4u-mvp-api.onrender.com',
  // backend_url_base: 'https://g4u-mvp-api-staging.onrender.com',
  // backend_url_base: 'https://g4u-mvp-api-1.onrender.com',
  // backend_url_base: 'http://194.163.158.136:1935'
  
  // Funifier API Configuration
  funifier_api_url: 'https://service2.funifier.com/v3/',
  funifier_api_key: '69b1ff7c607db81962c1fa86',
  funifier_base_url: 'https://service2.funifier.com/v3/',
  funifier_basic_token: 'NjliMWZmN2M2MDdkYjgxOTYyYzFmYTg2OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==',
  
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
  ).trim()
};
