import { DefinePlugin } from 'webpack';
import { config } from 'dotenv';
import * as path from 'path';

// Load .env from project root (same folder as this file). Relying on cwd() alone often leaves vars empty under ng serve / IDEs.
config({ path: path.resolve(__dirname, '.env') });

// Helper to safely get environment variable
const getEnv = (key: string, defaultValue: string = ''): string => {
    return process.env[key] || defaultValue;
};

const gamificacaoApiUrl =
    getEnv('GAMIFICACAO_API_URL') ||
    getEnv('gamificacao_api_url') ||
    '';
const gamificacaoApiToken =
    getEnv('GAMIFICACAO_API_TOKEN') ||
    getEnv('gamificacao_api_token') ||
    '';

const backendUrlBase =
    getEnv('G4U_API_BASE') ||
    getEnv('g4u_api_base') ||
    getEnv('BACKEND_URL_BASE') ||
    getEnv('backend_url_base') ||
    '';

if (!gamificacaoApiToken && process.env['NODE_ENV'] !== 'production') {
    console.warn(
        '[webpack] GAMIFICACAO_API_TOKEN is empty after loading .env — expected GAMIFICACAO_API_TOKEN or gamificacao_api_token in .env next to custom-webpack.config.ts'
    );
}

module.exports = {
    plugins: [
        new DefinePlugin({
            // Define process.env for browser compatibility
            // This replaces process.env references at build time
            'process.env': JSON.stringify({
                // Uppercase (standard convention)
                BACKEND_URL_BASE: backendUrlBase,
                G4U_API_BASE: backendUrlBase,
                CLIENT_ID: getEnv('CLIENT_ID'),
                LOGO_URL: getEnv('LOGO_URL'),
                SUPERVISOR_TEAM_CODE: getEnv('SUPERVISOR_TEAM_CODE'),
                GESTOR_TEAM_CODE: getEnv('GESTOR_TEAM_CODE'),
                DIRETOR_TEAM_CODE: getEnv('DIRETOR_TEAM_CODE'),
                // Supabase (Carteira / companies) — publishable or legacy anon JWT
                SUPABASE_URL: getEnv('SUPABASE_URL'),
                SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
                SUPABASE_PROJECT_ID: getEnv('SUPABASE_PROJECT_ID'),
                SUPABASE_COMPANIES_TABLE: getEnv('SUPABASE_COMPANIES_TABLE', 'companies'),
                SUPABASE_DB_SCHEMA: getEnv('SUPABASE_DB_SCHEMA', 'public'),
                SUPABASE_USE_MOCK: getEnv('SUPABASE_USE_MOCK', ''),
                SUPABASE_MOCK_FEED_ALL_USERS: getEnv('SUPABASE_MOCK_FEED_ALL_USERS', ''),
                // Lowercase (Vercel compatibility)
                backend_url_base: backendUrlBase,
                g4u_api_base: backendUrlBase,
                client_id: getEnv('client_id'),
                logo_url: getEnv('logo_url'),
                supervisor_team_code: getEnv('supervisor_team_code'),
                gestor_team_code: getEnv('gestor_team_code'),
                diretor_team_code: getEnv('diretor_team_code'),
                supabase_url: getEnv('supabase_url'),
                supabase_anon_key: getEnv('supabase_anon_key'),
                supabase_project_id: getEnv('supabase_project_id'),
                supabase_companies_table: getEnv('supabase_companies_table', 'companies'),
                supabase_db_schema: getEnv('supabase_db_schema', 'public'),
                supabase_use_mock: getEnv('supabase_use_mock', ''),
                supabase_mock_feed_all_users: getEnv('supabase_mock_feed_all_users', ''),
                // Same values on all keys so bracket/dot access and CI mirrors all resolve.
                GAMIFICACAO_API_URL: gamificacaoApiUrl,
                GAMIFICACAO_API_TOKEN: gamificacaoApiToken,
                gamificacao_api_url: gamificacaoApiUrl,
                gamificacao_api_token: gamificacaoApiToken
            })
        }),
        // Webpack often fails to fold process.env['KEY'] from the object above; these literals fix runtime reads.
        new DefinePlugin({
            'process.env.GAMIFICACAO_API_URL': JSON.stringify(gamificacaoApiUrl),
            'process.env.GAMIFICACAO_API_TOKEN': JSON.stringify(gamificacaoApiToken),
            'process.env.gamificacao_api_url': JSON.stringify(gamificacaoApiUrl),
            'process.env.gamificacao_api_token': JSON.stringify(gamificacaoApiToken),
            'process.env.BACKEND_URL_BASE': JSON.stringify(backendUrlBase),
            'process.env.G4U_API_BASE': JSON.stringify(backendUrlBase),
            'process.env.backend_url_base': JSON.stringify(backendUrlBase),
            'process.env.g4u_api_base': JSON.stringify(backendUrlBase)
        })
    ]
};
