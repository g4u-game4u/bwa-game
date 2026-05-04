# Relatórios `GET /game/reports/*` (Supabase RPC)

Aplicar a migration [`supabase/migrations/20260430160000_game_reports_rpc.sql`](../supabase/migrations/20260430160000_game_reports_rpc.sql) no projeto Supabase antes de chamar os endpoints.

## Cabeçalhos

- `Authorization: Bearer <jwt>`
- `client_id: <cliente>` (obrigatório em toda a API)

## Parâmetros comuns

| Parâmetro | Uso |
|-----------|-----|
| `email` | E-mail filtrado (`user_action.user_email`). Com vista **por colaborador**, enviar `email` (e opcionalmente `team_id` para escopo de equipa). Para vista **consolidada da equipa** (gestor, sem colaborador selecionado), omitir `email` e enviar só `team_id` (= id de equipa BWA / escopo no JWT). Jogadores (`PLAYER`) só podem usar o próprio e-mail do token. |
| `team_id` | Escopo de equipa nos relatórios. **Consolidado:** só `team_id` + intervalos. **Colaborador:** `email` + `team_id` opcional conforme contrato da API. |
| `status` | Opcional. Repita (`status=DONE&status=DELIVERED`) ou CSV (`status=DONE,DELIVERED`). Se omitido, cada endpoint usa o default da RPC (igual aos SQLs originais). |
| `finished_at_start` / `finished_at_end` | Intervalo ISO-8601 em `finished_at` (relatórios “finished”). |
| `dt_prazo_start` / `dt_prazo_end` | Datas (ISO) aplicadas a `(extra->>'dt_prazo')::date`. |
| `offset` / `limit` | Apenas nos endpoints paginados (`limit` máx. 500). |

## Endpoints

### 1. Resumo finalizadas + deliveries distintas

`GET /game/reports/finished/summary`

Equivale a “Contagem de tarefas finalizadas e pontos” + “Contagem de deliveries com tarefas finalizadas”.

Exemplo:

```bash
curl -sS -G "http://localhost:3000/game/reports/finished/summary" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "client_id: bwa" \
  --data-urlencode "email=matheus.sousa@bwa.global" \
  --data-urlencode "finished_at_start=2026-03-01T00:00:00.000Z" \
  --data-urlencode "finished_at_end=2026-07-01T23:59:59.000Z"
```

Resposta: `{ "tasks_count", "points_sum", "deliveries_count" }`.

### 2. Lista de deliveries finalizadas

`GET /game/reports/finished/deliveries`

Resposta: array JSON de strings (`delivery_title`), ordenado ascendente.

### 3. Tarefas finalizadas por delivery (paginado)

`GET /game/reports/finished/actions-by-delivery`

Parâmetro extra obrigatório: `delivery_title`.

```bash
curl -sS -G "http://localhost:3000/game/reports/finished/actions-by-delivery" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "client_id: bwa" \
  --data-urlencode "email=matheus.sousa@bwa.global" \
  --data-urlencode "finished_at_start=2026-03-01T00:00:00.000Z" \
  --data-urlencode "finished_at_end=2026-07-01T23:59:59.000Z" \
  --data-urlencode "delivery_title=ACADEMIA DE JIU-JITSU VP LTDA" \
  --data-urlencode "offset=0" \
  --data-urlencode "limit=10"
```

### 4. Meta do mês (contagem + pontos por prazo)

`GET /game/reports/goal/month/summary`

```bash
curl -sS -G "http://localhost:3000/game/reports/goal/month/summary" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "client_id: bwa" \
  --data-urlencode "email=matheus.sousa@bwa.global" \
  --data-urlencode "dt_prazo_start=2026-04-01" \
  --data-urlencode "dt_prazo_end=2026-05-01"
```

### 5. Pendentes por prazo (paginado)

`GET /game/reports/pending/by-deadline`

```bash
curl -sS -G "http://localhost:3000/game/reports/pending/by-deadline" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "client_id: bwa" \
  --data-urlencode "email=matheus.sousa@bwa.global" \
  --data-urlencode "dt_prazo_start=2026-04-01" \
  --data-urlencode "dt_prazo_end=2026-05-01" \
  --data-urlencode "offset=0" \
  --data-urlencode "limit=10"
```
