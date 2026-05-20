# Painel do jogador — integração frontend (cache)

Guia para substituir as chamadas antigas de relatório por **uma única requisição** que lê dados pré-calculados em `player_dashboard_report_cache`.

Documentação técnica do backend (cron, SQL): [game-reports-rpc.md](./game-reports-rpc.md#dashboard-do-jogador-cache-denormalizado-v2).

Painel de **supervisão por time** (outro guia): [supervision-dashboard-cached-frontend.md](./supervision-dashboard-cached-frontend.md).

---

## Resumo da mudança

| Antes (4+ chamadas) | Depois (1 chamada) |
|---------------------|-------------------|
| `GET /game/reports/finished/summary` | — |
| `GET /game/reports/open/summary` | — |
| `GET /game/reports/goal/month/summary` | **`GET /game/reports/dashboard/cached`** |
| `GET /game/reports/finished/deliveries` | **`GET /game/reports/finished/deliveries/cached`** (lista + % no prazo) |

Vantagens: menos latência, sem montar `dt_prazo_*` / `finished_at_*` no cliente, intervalos de temporada e mês vêm em `params`.

---

## Endpoint

```
GET /game/reports/dashboard/cached
```

### Headers (obrigatórios)

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer <access_token>` |
| `client_id` | ID do tenant (ex.: `bwa`) |

### Query

| Parâmetro | Obrigatório | Formato | Descrição |
|-----------|-------------|---------|-----------|
| `email` | Sim | e-mail válido | Jogador consultado. **PLAYER** só pode usar o próprio e-mail do JWT. |
| `month` | Sim | `YYYY-MM` ou `YYYY-MM-DD` | Mês de referência do painel (ex.: `2026-05` → cache de maio). |

Não envie `dt_prazo_start`, `finished_at_start`, etc. — os intervalos usados no cálculo vêm em `params` na resposta.

### Exemplo

```http
GET /game/reports/dashboard/cached?email=matheus.sousa@bwa.global&month=2026-05
Authorization: Bearer eyJhbGciOi...
client_id: bwa
```

```bash
curl -sS -G "https://<API_BASE>/game/reports/dashboard/cached" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "client_id: bwa" \
  --data-urlencode "email=matheus.sousa@bwa.global" \
  --data-urlencode "month=2026-05"
```

---

## Resposta `200 OK`

### TypeScript

```typescript
export interface PlayerDashboardCachedParams {
  /** Primeiro dia do mês no cache (ex.: "2026-05-01") */
  cache_month: string;
  /** Início da temporada (campanha vigente na data do refresh) */
  season_start: string;
  season_end: string;
  /** Início/fim do mês usado nas métricas "month_*" (dt_prazo) */
  month_start: string;
  month_end: string;
}

export interface PlayerDashboardCachedResponse {
  refreshed_at: string; // ISO-8601 — última atualização do cache

  params: PlayerDashboardCachedParams;

  // Temporada (campanha ativa: finished_at, status DONE + DELIVERED)
  season_points_total: number;
  season_clients_total: number;
  season_tasks_finished_total: number;

  // Mês selecionado (extra.dt_prazo no intervalo month_start..month_end)
  month_points_done_delivered: number;
  month_goal_points: number;
  month_pending_tasks_count: number;
  month_finished_tasks_count: number;
  month_clients_served: number;
  /** 0–100: % de tarefas DONE/DELIVERED no mês com finished_at no prazo (dia UTC ≤ dt_prazo) */
  month_on_time_delivery_pct: number;

  refresh_error?: string | null; // null se o último refresh OK
}
```

### Exemplo JSON

```json
{
  "refreshed_at": "2026-05-20T19:59:15.123Z",
  "params": {
    "cache_month": "2026-05-01",
    "season_start": "2026-03-01",
    "season_end": "2026-06-30",
    "month_start": "2026-05-01",
    "month_end": "2026-05-31"
  },
  "season_points_total": 1840,
  "season_clients_total": 22,
  "season_tasks_finished_total": 95,
  "month_points_done_delivered": 320,
  "month_goal_points": 450,
  "month_pending_tasks_count": 12,
  "month_finished_tasks_count": 28,
  "month_clients_served": 8,
  "month_on_time_delivery_pct": 87.5,
  "refresh_error": null
}
```

---

## Mapeamento: UI antiga → campos novos

Use esta tabela ao refatorar componentes do painel.

| Bloco típico no painel | Endpoint antigo | Campos antigos | Campo novo |
|------------------------|-----------------|----------------|------------|
| Pontos na temporada | `finished/summary` (intervalo temporada) | `points_sum` | `season_points_total` |
| Clientes na temporada | `finished/summary` | `deliveries_count` | `season_clients_total` |
| Tarefas finalizadas na temporada | `finished/summary` | `tasks_count` | `season_tasks_finished_total` |
| Pontos do mês (realizado) | `goal/month/summary` com status DONE+DELIVERED *ou* lógica custom | `points_sum` | `month_points_done_delivered` |
| Meta de pontos do mês | `goal/month/summary` (default status) | `points_sum` | `month_goal_points` |
| Tarefas pendentes no mês | `open/summary` | `tasks_count` | `month_pending_tasks_count` |
| Tarefas finalizadas no mês | derivado de `goal/month` / `finished` | `tasks_count` | `month_finished_tasks_count` |
| Clientes atendidos no mês | `finished/summary` no mês *ou* `deliveries_count` | `deliveries_count` | `month_clients_served` |
| % entregas no prazo (mês) | *(cálculo custom no front)* | — | `month_on_time_delivery_pct` |

### Lista de clientes (cache separado)

| Endpoint antigo | Novo | Campos principais |
|-----------------|------|-------------------|
| `GET /game/reports/finished/deliveries` | `GET /game/reports/finished/deliveries/cached?email&month&offset&limit` | `delivery_title`, `emp_id`, `user_email`, `on_time_pct` (+ `tasks_total` / `tasks_on_time`) |

- Mesmo `month` do dashboard; populado pelo **mesmo cron** (`dashboard-cache:refresh-once`).
- **404** se o mês não foi refreshado (igual KPIs).
- **200** com `items: []` se o refresh rodou mas o jogador não tem deliveries na temporada.
- `params.season_*` e `params.month_*` explicam as janelas (lista = temporada, % = mês por `dt_prazo`).

```bash
curl -sS -G "https://<API_BASE>/game/reports/finished/deliveries/cached" \
  -H "Authorization: Bearer <JWT>" \
  -H "client_id: bwa" \
  --data-urlencode "email=matheus.sousa@bwa.global" \
  --data-urlencode "month=2026-05" \
  --data-urlencode "offset=0" \
  --data-urlencode "limit=50"
```

### Sem equivalente no cache

| Endpoint antigo | O que fazia | Alternativa no front |
|-----------------|-------------|----------------------|
| `GET /game/reports/pending/by-deadline` | Lista paginada de pendentes | Manter ao vivo na tela de listagem |
| `GET /game/reports/user-actions` | Lista de ações | Manter ao vivo |
| `GET /game/reports/finished/actions-by-delivery` | Detalhe por delivery | Manter ao vivo |

O painel **resumo/KPI** deve usar `dashboard/cached`. A **lista de clientes/deliveries** deve usar `finished/deliveries/cached`. Drill-down (`actions-by-delivery`, `user-actions`) pode continuar nos endpoints ao vivo.

---

## Regras de negócio (o que cada número significa)

### Temporada (`season_*`)

- Janela: campanha **vigente** em `campaign` (`starts_at` ≤ hoje ≤ `finishes_at`) no momento em que o **cron** rodou para aquele mês.
- Filtro em `user_action`: `finished_at` no intervalo da temporada, status **DONE** ou **DELIVERED**.
- `season_clients_total`: quantidade de **clientes distintos** (`delivery_title` / `delivery_id`).

### Mês (`month_*`)

- Janela: `params.month_start` .. `params.month_end` (mês civil do parâmetro `month`).
- Filtro em `user_action`: `(extra->>'dt_prazo')::date` no intervalo.
- `month_points_done_delivered`: soma de `points` com status **DONE** ou **DELIVERED**.
- `month_goal_points`: soma de `points` com status **PENDING**, **DOING**, **DONE** ou **DELIVERED** (meta do mês).
- `month_pending_tasks_count`: contagem de tarefas **PENDING** ou **DOING**.
- `month_finished_tasks_count`: contagem de tarefas **DONE** ou **DELIVERED**.
- `month_clients_served`: clientes distintos com tarefas DONE/DELIVERED no mês.
- `month_on_time_delivery_pct`: entre as tarefas **DONE/DELIVERED** do mês (mesmo filtro `dt_prazo`), com `finished_at` preenchido, percentual em que `(finished_at em UTC)::date` é **≤** `extra.dt_prazo` (data). Sem finalizadas no mês → `0`.

---

## Parâmetro `month` no frontend

- Envie o mês que o usuário está visualizando no seletor do painel: `2026-05`, `2026-04`, etc.
- O backend normaliza para o primeiro dia do mês (`cache_month` = `2026-05-01`).
- Cada mês precisa ter sido **populado pelo cron**; caso contrário → **404**.

Sugestão de UX:

1. Seletor de mês (ex.: maio / abril / março).
2. Ao trocar o mês, nova chamada com `month=YYYY-MM`.
3. Exibir subtítulo com `params.month_start` – `params.month_end` e temporada `params.season_start` – `params.season_end`.
4. Opcional: “Atualizado em …” usando `refreshed_at` (locale do usuário).

---

## Erros

| HTTP | Quando | Ação sugerida no front |
|------|--------|------------------------|
| **200** | Cache existe | Renderizar KPIs |
| **404** | Sem linha para `(client_id, email, month)` | Mensagem “Dados do mês ainda não disponíveis”; não repetir os 4 endpoints antigos automaticamente |
| **400** | `month` inválido | Validar formato `YYYY-MM` antes de chamar |
| **400** | PLAYER consultando e-mail de outro | Usar sempre o e-mail do token para role PLAYER |
| **401** | Token inválido | Renovar sessão |

Corpo típico do 404:

```json
{
  "statusCode": 404,
  "message": "Dashboard cache not found for player and month",
  "error": "Not Found"
}
```

---

## Exemplo de serviço (fetch)

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export async function fetchPlayerDashboardCached(
  token: string,
  clientId: string,
  email: string,
  month: string, // "2026-05"
): Promise<PlayerDashboardCachedResponse> {
  const url = new URL(`${API_BASE}/game/reports/dashboard/cached`);
  url.searchParams.set('email', email);
  url.searchParams.set('month', month);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      client_id: clientId,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}
```

### PLAYER: e-mail automático

```typescript
// Após login, para role PLAYER:
const email = session.user.email;
const month = selectedMonth; // "2026-05"

const dashboard = await fetchPlayerDashboardCached(
  token,
  clientId,
  email,
  month,
);
```

### ADMIN / GESTOR: e-mail do jogador visualizado

Mesma rota; passe o e-mail do jogador selecionado (desde que o token tenha permissão).

---

## Checklist de migração

- [ ] Remover chamadas paralelas a `finished/summary`, `open/summary` e `goal/month/summary` no **painel resumo**.
- [ ] Adicionar uma chamada a `dashboard/cached` com `email` + `month`.
- [ ] Ligar seletor de mês ao query param `month`.
- [ ] Atualizar bindings dos KPIs conforme tabela de mapeamento.
- [ ] Tratar **404** (mês sem cache) com mensagem amigável.
- [ ] Exibir `refreshed_at` se quiser indicar defasagem dos dados.
- [ ] Trocar lista de clientes para `finished/deliveries/cached` (`email` + `month` + paginação).
- [ ] Manter `pending/by-deadline` e demais listas ao vivo onde a UI ainda precisar.
- [ ] Remover construção manual de `finished_at_start/end` da temporada no front (vêm em `params` só para exibição).

---

## Disponibilidade dos dados

O cache é gerado pelo backend (cron ou script). Para o cliente `bwa`, maio/2026 já foi populado em massa (`--all --month=2026-05`).

Outros meses só respondem **200** depois de rodar o refresh daquele mês. Coordene com backend antes de liberar novos meses no seletor.

---

## Swagger

Contrato também em `/api` (Nest): tag **Game**, operação **Dashboard do jogador (cache denormalizado)**.

Modelos: `PlayerDashboardCachedReportResponseModel`, `GameReportDashboardCachedQueryModel`.

## RLS (acesso direto Supabase)

Se o front usar o client Supabase com JWT (não só a API Nest), aplique a migration de RLS e leia [player-dashboard-report-cache-rls.md](./player-dashboard-report-cache-rls.md). Resumo: **PLAYER** só vê o próprio `user_email`; **GESTOR** vê times que lidera/observa; **ADMIN** vê o tenant; escrita só `service_role`.
