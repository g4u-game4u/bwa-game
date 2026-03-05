/**
 * Production environment configuration
 * 
 * IMPORTANT: This file uses hardcoded default values.
 * For deployment, these values should be replaced at build time using:
 * 1. CI/CD pipeline environment variable substitution
 * 2. Docker build args
 * 3. Vercel/Netlify environment variables (injected at build time)
 * 
 * The build process should replace placeholder values like '${ENV_VAR_NAME}'
 * with actual environment variable values.
 */
export const environment = {
  production: true,
  client_id: 'bwa',
  backend_url_base: '',
  
  // Funifier API Configuration
  funifier_api_url: 'https://service2.funifier.com/v3/',
  funifier_api_key: '690a785ce179d46fce59ed65',
  funifier_base_url: 'https://service2.funifier.com/v3/',
  funifier_basic_token: 'NjkwYTc4NWNlMTc5ZDQ2ZmNlNTllZDY1OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==',
  
  // Cache Configuration
  cacheTimeout: 300000, // 5 minutes in milliseconds
  
  // Feature Flags
  enableAnalytics: true,
  
  // Logo Configuration
  // Empty string means use default logo
  logoUrl: '',
  
  // Team Code Configuration
  // Default values for management team codes
  supervisorTeamCode: 'Fkmdmko',
  gestorTeamCode: 'FkmdnFU',
  diretorTeamCode: 'FkmdhZ9'
};
