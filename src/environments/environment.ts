export const environment = {
  production: false,
  // client_id: 'cidadania4u',
  client_id: 'bwa',
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

  // Modo manutenção: bloqueia login e redireciona usuários logados para página de manutenção
  maintenanceMode: false
};
