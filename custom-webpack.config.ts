import { DefinePlugin } from 'webpack';
import { config } from 'dotenv';

// Load .env file if it exists (for local development)
config();

// Helper to safely get environment variable
const getEnv = (key: string, defaultValue: string = ''): string => {
    return process.env[key] || defaultValue;
};

module.exports = {
    plugins: [
        new DefinePlugin({
            // Define process.env for browser compatibility
            // This replaces process.env references at build time
            //
            // Chaves explícitas `process.env.NAME`: o Webpack nem sempre substitui
            // `process.env['NAME']` quando só existe o objeto abaixo — aí o valor some
            // no bundle e o código cai no fallback (ex.: BACKEND_URL_BASE = http://localhost).
            'process.env.G4U_API_BASE': JSON.stringify(getEnv('G4U_API_BASE')),
            'process.env.g4u_api_base': JSON.stringify(getEnv('g4u_api_base')),
            'process.env': JSON.stringify({
                // Uppercase (standard convention)
                BACKEND_URL_BASE: getEnv('BACKEND_URL_BASE'),
                CLIENT_ID: getEnv('CLIENT_ID'),
                FUNIFIER_BASIC_TOKEN: getEnv('FUNIFIER_BASIC_TOKEN'),
                FUNIFIER_BASE_URL: getEnv('FUNIFIER_BASE_URL'),
                FUNIFIER_API_KEY: getEnv('FUNIFIER_API_KEY'),
                LOGO_URL: getEnv('LOGO_URL'),
                SUPERVISOR_TEAM_CODE: getEnv('SUPERVISOR_TEAM_CODE'),
                GESTOR_TEAM_CODE: getEnv('GESTOR_TEAM_CODE'),
                DIRETOR_TEAM_CODE: getEnv('DIRETOR_TEAM_CODE'),
                G4U_API_BASE: getEnv('G4U_API_BASE'),
                SUPABASE_URL: getEnv('SUPABASE_URL'),
                SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
                SUPABASE_SERVICE_ROLE_SECRET: getEnv('SUPABASE_SERVICE_ROLE_SECRET'),
                // Lowercase (Vercel compatibility)
                backend_url_base: getEnv('backend_url_base'),
                client_id: getEnv('client_id'),
                funifier_basic_token: getEnv('funifier_basic_token'),
                funifier_base_url: getEnv('funifier_base_url'),
                funifier_api_key: getEnv('funifier_api_key'),
                logo_url: getEnv('logo_url'),
                supervisor_team_code: getEnv('supervisor_team_code'),
                gestor_team_code: getEnv('gestor_team_code'),
                diretor_team_code: getEnv('diretor_team_code'),
                g4u_api_base: getEnv('g4u_api_base'),
                supabase_url: getEnv('supabase_url'),
                supabase_anon_key: getEnv('supabase_anon_key'),
                supabase_service_role_secret: getEnv('supabase_service_role_secret')
            })
        })
    ]
};
