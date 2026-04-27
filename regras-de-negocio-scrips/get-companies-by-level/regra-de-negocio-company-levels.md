# Regra de negócio: company levels → `extra` em deliveries

Defina as variáveis no `.env` na **raiz do repositório** (ou em `regras-de-negocio-scrips/migration-tools/.env`). Não commite senhas nem tokens.

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `PORTAL_BWA_API_URL` | Base da API (ex.: `https://api.bwa.global:3334`) |
| `PORTAL_BWA_LOGIN_EMAIL` | E-mail do login portal |
| `PORTAL_BWA_LOGIN_PASSWORD` | Senha (`senha` no POST de token) |
| `PORTAL_BWA_EMPRESAS_CURSOR_PARAM` | (Opcional) Nome do parâmetro de query para o valor de `next_cursor` na página seguinte; padrão no script: `cursor` |
| `GAMIFICACAO_API_URL` | URL do GET gamificação (hook) |
| `GAMIFICACAO_API_TOKEN` | Token enviado no header `x-api-token` |
| `G4U_API_BASE` ou `BACKEND_URL_BASE` | Host da API Game4U. Passo 4: `POST /auth/login` → `GET /delivery` (sem query) → `PUT /delivery/{id}` |
| `CLIENT_ID` | Cliente enviado no header `client_id` no login e nas chamadas |
| `GAME4U_ADMIN_LOGIN_EMAIL` / `GAME4U_ADMIN_LOGIN_PASSWORD` | (Recomendado no passo 4) Conta **admin** para o token Bearer |
| `GAME4U_LOGIN_EMAIL` / `GAME4U_LOGIN_PASSWORD` | Alternativa se não usar `GAME4U_ADMIN_LOGIN_*` |
| `GAME4U_DELIVERIES_LIST_PATH` | (Opcional) Path do GET de listagem; default `/delivery` |
| `GAME4U_DELIVERIES_PAGE_SIZE` | (Opcional) `limit` por pedido (1–500, ex. `500`). Ativa `?page=&limit=` e resposta `{ items, total, page, limit, totalPages }` |
| `GAME4U_DELIVERIES_PAGINATION` | (Opcional) `page` (default) ou `offset` para modo `?offset=&limit=` |
| `GAME4U_DELIVERIES_PAGE_QUERY_PARAM` / `GAME4U_DELIVERIES_LIMIT_QUERY_PARAM` | (Opcional) Nomes dos query params; defaults `page` e `limit` |
| `GAME4U_DELIVERIES_OFFSET_PARAM` / `GAME4U_DELIVERIES_LIMIT_PARAM` | Só com `PAGINATION=offset` — ex. `skip` / `take` |
| `GAME4U_PUT_PROGRESS_EVERY` | (Opcional) Log resumido a cada N PUTs (com `--progress-every` no CLI) |
| `GAME4U_PUT_DELAY_MS` | (Opcional) Pausa entre PUTs em ms (ou `--put-delay-ms`) |
| `GAME4U_RESUME_SKIP_PUTS` | (Opcional) Ignorar os primeiros N matches (PUTs elegíveis) para retomar uma corrida; ou `--resume-skip-puts N` |
| `GAME4U_PUT_MAX_ATTEMPTS` / `GAME4U_PUT_RETRY_BASE_MS` | (Opcional) Retries com backoff em falhas transitórias do PUT (5xx, 429, corpo com `fetch failed`, etc.) |
| `GAME4U_AUTH_401_MAX_REFRESH` | (Opcional) Em corridas longas o JWT expira; o script faz novo login em **401** e repete GET/PUT (default 5 renovações por pedido) |
| `GAME4U_DELIVERY_ITEM_PATH` | (Opcional) Prefixo do PUT por `id`; default `/delivery` |

## Automação

Na pasta `regras-de-negocio-scrips/migration-tools`:

```bash
npm run company-levels:sync
```

Saída em `regras-de-negocio-scrips/get-companies-by-level/out/` (`portal-empresas.json`, `gamificacao-empresas.json`, `company-completo.json`).

Passo 4 (PUT em deliveries) é **opcional**: por padrão roda só os passos 1–3. Com `portal-empresas.json` e `gamificacao-empresas.json` já em `out/`, rode **só o passo 4** (sem portal/gamificação na rede; só Game4U):

```bash
npm run company-levels:step4
```

Opções extra vão depois do `--`, por exemplo `npm run company-levels:step4 -- --max-puts 50 --dry-run`. Para retomar após N PUTs já aplicados: `--resume-skip-puts N` (conta só deliveries com match em `company-completo`).

Para testar um único PUT no fluxo completo (passos 1–3 + 4):

```bash
npm run company-levels:sync -- --apply-deliveries --max-puts 1
```

Ou só simular o PUT:

```bash
npm run company-levels:sync:deliveries:dry
```

(`--help` no script lista todas as flags.)

---

## Passos (especificação)

1. Logar no PORTAL BWA (`/api/autenticacao/obter-token-acesso/`) com payload `email` e `senha`. Buscar empresas ativas em todas as páginas: a API responde com `items`, `has_next` e `next_cursor`; o script repete o GET com `limit`, `ativa_na_bwa` e o cursor no query (por padrão `?cursor=<next_cursor>`). Salvar em JSON com `cnpj`, `razao_social`, `classificacao`, `uf`, `forma_de_tributacao`, `cliente_em_onboarding` e `cliente_em_risco`.

2. `GET` em `GAMIFICACAO_API_URL` (com `x-api-token`) e salvar o resultado em outro JSON.

3. Cruzar os dois JSON pela chave **CNPJ** (portal sem máscara, gamificação com máscara — normalização por dígitos). Salvar em `company-completo.json` os registros com: `empId`, `classificacao`, `cnpj`, `razao_social`, `uf`, `forma_de_tributacao`, `cliente_em_onboarding`, `cliente_em_risco`.

4. `POST {BASE}/auth/login` com credenciais **admin** e `client_id`; usar o token `Bearer` nas chamadas seguintes. Listagem: `GET {BASE}/delivery` sem query, ou com **`page` e `limit`** (1–500; resposta `{ items, total, page, limit, totalPages }`). O script percorre `page=1..totalPages`. Alternativa legada: `GAME4U_DELIVERIES_PAGINATION=offset`. O `id` de cada delivery segue `empId`-competência; extrair EmpID como em `gamificacao-delivery-empid.util.ts`. Se coincidir com `empId` em `company-completo.json`, `PUT {BASE}/delivery/{id}` com corpo `{ extra: { ... } }`.

**Correr em massa:** ex. `GAME4U_DELIVERIES_PAGE_SIZE=500` e `npm run company-levels:step4:all -- --put-delay-ms 10 --progress-every 500`. **Retomar:** se a corrida parar no PUT 7001, use `--resume-skip-puts 7000` (ou `GAME4U_RESUME_SKIP_PUTS=7000`) com `--reuse-json` para não refazer portal/gamificação.

**Observação:** validar o passo 4 com `--max-puts 1` (ou `--dry-run`) antes de subir o limite.
