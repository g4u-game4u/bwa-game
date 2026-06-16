/**
 * Smoke barato: GET (grátis) + POST único com depth=1 (menor contexto → menos tokens).
 * Uso: node scripts/smoke-org-hierarchy-insights.mjs [YYYY-MM]
 */
import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';

const month = (process.argv[2] || '2026-06').trim();
const depth = 1;
const focus = 'risks_and_actions';
const baseRaw = (process.env.G4U_API_BASE || process.env.backend_url_base || '').trim();
if (!baseRaw) {
  console.error('Defina G4U_API_BASE ou backend_url_base no .env');
  process.exit(1);
}

const baseUrl = new URL(/^https?:\/\//i.test(baseRaw) ? baseRaw : `https://${baseRaw}`);
const transport = baseUrl.protocol === 'https:' ? https : http;
const requestOptions = {
  hostname: baseUrl.hostname,
  port: baseUrl.port ? Number(baseUrl.port) : baseUrl.protocol === 'https:' ? 443 : 80
};

function request({ path, method = 'GET', token, body }) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = { client_id: process.env.client_id || 'bwa' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const req = transport.request({ ...requestOptions, path, method, headers }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login() {
  const res = await request({
    path: '/auth/login',
    method: 'POST',
    body: {
      email: process.env.G4U_ADMIN_EMAIL,
      password: process.env.G4U_ADMIN_PASSWORD
    }
  });
  const token = res.json?.access_token || res.json?.accessToken;
  if (!token) {
    throw new Error(`Login falhou (${res.status}): ${res.raw.slice(0, 300)}`);
  }
  return token;
}

function summarize(json) {
  if (!json || typeof json !== 'object') return null;
  return {
    from_cache: json.from_cache,
    generated_at: json.generated_at,
    llm_model: json.llm_model,
    summary_preview: String(json.summary || '').slice(0, 160),
    insights_count: Array.isArray(json.insights) ? json.insights.length : 0,
    first_title: json.insights?.[0]?.title
  };
}

function isRouteMissing(res) {
  return res.status === 404 && typeof res.raw === 'string' && /Cannot (GET|POST)/i.test(res.raw);
}

const getScopeQs = `month=${encodeURIComponent(month)}&depth=${depth}&focus=${encodeURIComponent(focus)}`;
const postScopeQs = `month=${encodeURIComponent(month)}&depth=${depth}`;

async function main() {
  console.log(`API: ${baseUrl.origin}`);
  console.log(`Escopo barato: month=${month}, depth=${depth}, focus=${focus}`);
  const token = await login();
  console.log('Login OK');

  const cached = await request({
    path: `/game/reports/organization/hierarchy-insights?${getScopeQs}`,
    token
  });
  console.log('GET cache', cached.status);
  if (cached.status === 200) {
    console.log(summarize(cached.json));
    console.log('Cache já existe — POST omitido (0 créditos extras).');
    return;
  }
  console.log(cached.raw?.slice(0, 280));

  if (isRouteMissing(cached)) {
    console.error('Rota não publicada neste host. Use g4u-mvp-api local ou faça deploy.');
    process.exit(1);
  }

  if (cached.status !== 404) {
    console.error('GET inesperado; abortando POST.');
    process.exit(1);
  }

  console.log('Sem cache — POST único (pode levar 5–30s)…');
  const generated = await request({
    path: `/game/reports/organization/hierarchy-insights?${postScopeQs}`,
    method: 'POST',
    token,
    body: { focus }
  });
  console.log('POST generate', generated.status);
  if (generated.status >= 200 && generated.status < 300) {
    console.log(summarize(generated.json));
    console.log('Sucesso — análise executiva salva (depth=1).');
    return;
  }
  console.log(generated.raw?.slice(0, 500));
  process.exit(1);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
