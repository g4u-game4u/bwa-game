const { DefinePlugin } = require('webpack');
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');

// Debug: Check if .env files exist
const envLocalPath = path.resolve(__dirname, '.env.local');
const envPath = path.resolve(__dirname, '.env');
console.log('🔍 Webpack Config - Checking .env files:');
console.log('  .env.local exists:', fs.existsSync(envLocalPath));
console.log('  .env exists:', fs.existsSync(envPath));

// Load .env.local first (takes precedence), then .env as fallback
const envLocalResult = config({ path: envLocalPath });
const envResult = config({ path: envPath });

console.log('  .env.local loaded:', !envLocalResult.error);
console.log('  .env loaded:', !envResult.error);
if (envLocalResult.error) console.log('  .env.local error:', envLocalResult.error.message);
if (envResult.error) console.log('  .env error:', envResult.error.message);

// Debug: Log what we got from process.env
console.log('  process.env.BACKEND_URL_BASE:', process.env.BACKEND_URL_BASE);
console.log('  process.env.G4U_API_BASE:', process.env.G4U_API_BASE);

// Helper to safely get environment variable
const getEnv = (key, defaultValue = '') => {
    return process.env[key] || defaultValue;
};

// Log the final values that will be injected
console.log('📦 Values being injected into bundle:');
console.log('  BACKEND_URL_BASE:', getEnv('BACKEND_URL_BASE'));
console.log('  G4U_API_BASE:', getEnv('G4U_API_BASE'));

module.exports = {
    plugins: [
        new DefinePlugin({
            // Define process.env as a complete object
            // This replaces ALL process.env references at build time
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
                USE_API_PROXY: getEnv('USE_API_PROXY'),
                SUPABASE_URL: getEnv('SUPABASE_URL'),
                SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
                SUPABASE_SERVICE_ROLE_SECRET: getEnv('SUPABASE_SERVICE_ROLE_SECRET'),
                RECEITA_CONCEDIDA_GOAL_TEMPLATE_ID: getEnv('RECEITA_CONCEDIDA_GOAL_TEMPLATE_ID'),
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
                use_api_proxy: getEnv('use_api_proxy'),
                supabase_url: getEnv('supabase_url'),
                supabase_anon_key: getEnv('supabase_anon_key'),
                supabase_service_role_secret: getEnv('supabase_service_role_secret'),
                receita_concedida_goal_template_id: getEnv('receita_concedida_goal_template_id')
            })
        })
    ]
};
