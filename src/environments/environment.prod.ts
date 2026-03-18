import maintenanceAllowedEmails from '../../maintenance-allowed-emails.json';

const maintenanceEmailsFromEnv =
  process.env['MAINTENANCE_ALLOWED_EMAILS_JSON'] || process.env['maintenanceAllowedEmailsJson'];

export const environment = {
  production: true,
  client_id: process.env['CLIENT_ID'] || process.env['client_id'] || '',
  backend_url_base: process.env['BACKEND_URL_BASE'] || process.env['backend_url_base'] || '',
  
  // Funifier API Configuration (supports both uppercase and lowercase env vars)
  funifier_api_url: process.env['FUNIFIER_BASE_URL'] || process.env['funifier_base_url'] || 'https://service2.funifier.com/v3/',
  funifier_api_key: process.env['FUNIFIER_API_KEY'] || process.env['funifier_api_key'] || '',
  funifier_base_url: process.env['FUNIFIER_BASE_URL'] || process.env['funifier_base_url'] || 'https://service2.funifier.com/v3/',
  funifier_basic_token: process.env['FUNIFIER_BASIC_TOKEN'] || process.env['funifier_basic_token'] || '',
  
  // Cache Configuration
  cacheTimeout: 300000, // 5 minutes in milliseconds
  
  // Feature Flags
  enableAnalytics: true,

  // Modo manutenção: bloqueia login e redireciona usuários logados para página de manutenção
  maintenanceMode: process.env['MAINTENANCE_MODE'] === 'true' || process.env['maintenanceMode'] === 'true',

  /**
   * Allowlist: use `MAINTENANCE_ALLOWED_EMAILS_JSON` no deploy ou o arquivo `maintenance-allowed-emails.json`.
   */
  maintenanceAllowedEmailsJson:
    typeof maintenanceEmailsFromEnv === 'string' && maintenanceEmailsFromEnv.trim()
      ? maintenanceEmailsFromEnv
      : JSON.stringify(maintenanceAllowedEmails as string[])
};
