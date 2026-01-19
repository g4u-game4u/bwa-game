export const environment = {
  production: true,
  client_id: process.env['CLIENT_ID'] || process.env['client_id'] || '',
  backend_url_base: process.env['BACKEND_URL_BASE'] || process.env['backend_url_base'] || '',
  
  // Funifier API Configuration (supports both uppercase and lowercase env vars)
  funifier_api_url: process.env['FUNIFIER_BASE_URL'] || process.env['funifier_base_url'] || 'https://service2.funifier.com',
  funifier_api_key: process.env['FUNIFIER_API_KEY'] || process.env['funifier_api_key'] || '',
  funifier_base_url: process.env['FUNIFIER_BASE_URL'] || process.env['funifier_base_url'] || 'https://service2.funifier.com',
  funifier_basic_token: process.env['FUNIFIER_BASIC_TOKEN'] || process.env['funifier_basic_token'] || '',
  
  // Cache Configuration
  cacheTimeout: 300000, // 5 minutes in milliseconds
  
  // Feature Flags
  enableAnalytics: true
};
