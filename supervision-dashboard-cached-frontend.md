# Painel de supervisão — integração frontend (cache por time)

Guia para refatorar o **painel de supervisão** (visão por time) usando o cache agregado `team_supervision_dashboard_report_cache`, em vez de várias chamadas de relatório com `team_id` e intervalos montados no cliente.

Documentação técnica (cron, SQL, RLS): [game-reports-rpc.md](./game-reports-rpc.md#supervisão-por-time-cache-agregado).

Relacionado: painel do **jogador** (por e-mail) em [player-dashboard-cached-frontend.md](./player-dashboard-cached-frontend.md).

---

## Resumo da mudança

| Antes (várias chamadas por time) | Depois |
|----------------------------------|--------|
| `GET /game/reports/finished/summary?team_id=…` (+ `finished_at_*`) | — |
| `GET /game/reports/open/summary?team_id=…` (+ `dt_prazo_*`) | — |
| `GET /game/reports/goal/month/summary?team_id=…` (+ `dt_prazo_*`) | **`GET /game/reports/supervision/dashboard/cached`** (um time) |
| Várias requisições repetidas ao trocar de time na grade | **`GET /game/reports/supervision/dashboard/cached/list`** (todos os times do mês) |

Vantagens: uma ou duas requisições por tela, mesmos nomes de métricas do painel do jogador, `params` com janelas de temporada/mês, `team_name` e `players_count` prontos.

**Roles permitidas:** `ADMIN`, `GESTOR`, `SERVICE` — **não** use estas rotas com `PLAYER`.

---

## Endpoints

### 1) Lista de times (grade / ranking)

```
GET /game/reports/supervision/dashboard/cached/list
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | `YYYY-MM` ou `YYYY-MM-DD` (ex.: `2026-05`) |

**GESTOR:** retorna só times que lidera, observa ou gerencia (mesma regra de outros relatórios com `team_id`).  
**ADMIN / SERVICE:** todos os times com cache naquele mês.

### 2) Um time (detalhe ou refresh pontual)

```
GET /game/reports/supervision/dashboard/cached
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | Mês de referência |
| `team_id` | Sim | ID numérico do time (string na query, ex.: `42`) |

---

## Headers (obrigatórios em ambos)

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer <access_token>` |
| `client_id` | ID do tenant (ex.: `bwa`) |

Não envie `dt_prazo_start`, `finished_at_start`, `email` (escopo é **time**, não jogador).

---

## Exemplos

### Lista (todos os times do mês)

```http
GET /game/reports/supervision/dashboard/cached/list?month=2026-05
Authorization: Bearer eyJhbGciOi...
client_id: bwa
```

```bash
curl -sS -G "https://<API_BASE>/game/reports/supervision/dashboard/cached/list" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "client_id: bwa" \
  --data-urlencode "month=2026-05"
```

### Um time

```http
GET /game/reports/supervision/dashboard/cached?team_id=42&month=2026-05
Authorization: Bearer eyJhbGciOi...
client_id: bwa
```

```bash
curl -sS -G "https://<API_BASE>/game/reports/supervision/dashboard/cached" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "client_id: bwa" \
  --data-urlencode "team_id=42" \
  --data-urlencode "month=2026-05"
```

---

## Resposta `200 OK`

### TypeScript

Reutilize os tipos de parâmetros do jogador; a resposta do time estende as mesmas métricas.

```typescript
export interface SupervisionDashboardCachedParams {
  cache_month: string;   // "2026-05-01"
  season_start: string;
  season_end: string;
  month_start: string;
  month_end: string;
}

/** Mesmas métricas que PlayerDashboardCachedResponse */
export interface SupervisionDashboardMetrics {
  season_points_total: number;
  season_clients_total: number;
  season_tasks_finished_total: number;
  month_points_done_delivered: number;
  month_goal_points: number;
  month_pending_tasks_count: number;
  month_finished_tasks_count: number;
  month_clients_served: number;
  month_on_time_delivery_pct: number; // 0–100, até 2 decimais
}

export interface SupervisionTeamDashboardCached extends SupervisionDashboardMetrics {
  refreshed_at: string;
  team_id: number;
  team_name: string | null;
  players_count: number;
  params: SupervisionDashboardCachedParams;
  refresh_error?: string | null;
}

export interface SupervisionDashboardCachedListResponse {
  teams: SupervisionTeamDashboardCached[];
}
```

### Exemplo JSON — um time

```json
{
  "refreshed_at": "2026-05-20T20:15:00.000Z",
  "team_id": 42,
  "team_name": "Time Alpha",
  "players_count": 8,
  "params": {
    "cache_month": "2026-05-01",
    "season_start": "2026-03-01",
    "season_end": "2026-06-30",
    "month_start": "2026-05-01",
    "month_end": "2026-05-31"
  },
  "season_points_total": 12400,
  "season_clients_total": 156,
  "season_tasks_finished_total": 620,
  "month_points_done_delivered": 2100,
  "month_goal_points": 2800,
  "month_pending_tasks_count": 95,
  "month_finished_tasks_count": 210,
  "month_clients_served": 48,
  "month_on_time_delivery_pct": 82.35,
  "refresh_error": null
}
```

### Exemplo JSON — lista

```json
{
  "teams": [
    {
      "refreshed_at": "2026-05-20T20:15:00.000Z",
      "team_id": 42,
      "team_name": "Time Alpha",
      "players_count": 8,
      "params": { "cache_month": "2026-05-01", "season_start": "2026-03-01", "season_end": "2026-06-30", "month_start": "2026-05-01", "month_end": "2026-05-31" },
      "season_points_total": 12400,
      "season_clients_total": 156,
      "season_tasks_finished_total": 620,
      "month_points_done_delivered": 2100,
      "month_goal_points": 2800,
      "month_pending_tasks_count": 95,
      "month_finished_tasks_count": 210,
      "month_clients_served": 48,
      "month_on_time_delivery_pct": 82.35,
      "refresh_error": null
    }
  ]
}
```

Lista vazia: `{ "teams": [] }` — refresh rodou mas nenhum jogador com cache naquele mês (ou nenhum time visível para o GESTOR).

---

## Mapeamento: UI antiga → campos novos

Use a **mesma tabela de KPIs** do [painel do jogador](./player-dashboard-cached-frontend.md#mapeamento-ui-antiga--campos-novos), trocando o escopo de `email` para **agregado do time**.

| Bloco no painel de supervisão | Antes | Depois |
|-------------------------------|-------|--------|
| Grade de times + KPIs por linha | N × (`finished/summary` + `open/summary` + `goal/month/summary`) com `team_id` | **1×** `supervision/dashboard/cached/list?month=` |
| Detalhe / cabeçalho de um time | Mesmas 3 rotas com `team_id` | `supervision/dashboard/cached?team_id=&month=` **ou** reutilizar objeto da lista |
| Nome do time | `GET /team/...` ou lista de times separada | `team_name` na resposta (pode ser `null`) |
| Quantidade de jogadores | Contagem manual / outra API | `players_count` |
| % no prazo (mês) | Cálculo no front ou endpoint ao vivo | `month_on_time_delivery_pct` |

### Drill-down para jogador

O cache de supervisão **não** substitui a visão individual do jogador. Ao abrir um jogador do time:

- KPIs do jogador → `GET /game/reports/dashboard/cached?email=&month=`
- Lista de deliveries do jogador → `GET /game/reports/finished/deliveries/cached?email=&month=`

Mantenha `team_id` só na navegação; o escopo do jogador continua sendo `email`.

### O que pode continuar ao vivo

| Endpoint | Quando manter |
|----------|----------------|
| `GET /game/reports/pending/by-deadline?team_id=` | Listagens operacionais de pendentes |
| `GET /game/reports/user-actions?team_id=` | Tabelas de ações |
| `GET /game/reports/team-daily-finished-stats?team_id=` | Gráfico diário (não está no cache de supervisão) |

---

## Regras de negócio (agregação por time)

Os números são a **soma** das linhas de `player_dashboard_report_cache` de cada jogador do time (mesmo `team_id` no cache do jogador).

| Campo | Agregação |
|-------|-----------|
| `season_points_total`, `month_*` (contagens e pontos) | **Soma** por jogador |
| `season_clients_total`, `month_clients_served` | **Soma** dos totais por jogador (não é “cliente único no time”; o mesmo cliente pode contar mais de uma vez se vários jogadores atenderam) |
| `month_on_time_delivery_pct` | **Média ponderada** pelo `month_finished_tasks_count` de cada jogador (não é média aritmética dos %) |
| `players_count` | Quantidade de jogadores com linha no cache daquele time/mês |
| `params.*` | Intervalos iguais entre jogadores do mesmo refresh (use para subtítulo da tela) |

Pré-requisito: cache de **jogadores** populado para o mês (`dashboard-cache:refresh-once --all` ou por e-mail). Depois o backend agrega times (`--teams-only` ou automaticamente ao final do `--all`).

---

## Fluxos recomendados no front

### Tela principal (vários times)

1. Seletor de mês → `month=YYYY-MM`.
2. Uma chamada: `GET .../supervision/dashboard/cached/list?month=`.
3. Renderizar tabela/cards com `team_name`, `players_count` e KPIs.
4. Ordenação/filtro **no cliente** (a API devolve times ordenados por `team_name`, `team_id`).
5. Opcional: `refreshed_at` do primeiro item ou o mais recente do array para “Atualizado em …”.

### Detalhe de um time

**Opção A (menos requisições):** passar o objeto da lista via state/router — métricas já vêm completas.

**Opção B:** rota com `teamId` na URL → `GET .../supervision/dashboard/cached?team_id=&month=` (útil após deep link ou F5).

### GESTOR

- Use **list** para popular o seletor de times; não liste times por outra API só para KPIs.
- Se **list** vier vazia e o usuário deveria ver times, verificar mês sem refresh ou permissões.
- **403** ao abrir um `team_id` fora da gestão → mensagem de permissão.

---

## Parâmetro `month`

Igual ao painel do jogador:

- Envie o mês exibido no seletor (`2026-05`).
- Backend normaliza para `cache_month` = primeiro dia do mês (`2026-05-01`).
- Sem cache para aquele mês → **404** (detalhe) ou **lista vazia** (list).

---

## Erros

| HTTP | Endpoint | Quando | Ação no front |
|------|----------|--------|----------------|
| **200** | list | Cache existe | Renderizar `teams` |
| **200** | list | `teams: []` | “Nenhum time com dados neste mês” ou mês sem refresh |
| **200** | cached | Linha do time existe | Renderizar KPIs |
| **404** | cached | Sem linha `(client_id, team_id, month)` | Mensagem amigável; não refazer 3 endpoints antigos |
| **400** | cached | `team_id` ausente/inválido | Validar antes da chamada |
| **400** | ambos | `month` inválido | Validar `YYYY-MM` |
| **403** | cached | GESTOR sem acesso ao time | Bloquear rota / voltar à lista |
| **401** | ambos | Token inválido | Renovar sessão |

Corpo típico do 404 (detalhe):

```json
{
  "statusCode": 404,
  "message": "Supervision dashboard cache not found for team and month",
  "error": "Not Found"
}
```

---

## Exemplo de serviço (fetch)

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

function headers(token: string, clientId: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    client_id: clientId,
  };
}

export async function fetchSupervisionDashboardList(
  token: string,
  clientId: string,
  month: string,
): Promise<SupervisionDashboardCachedListResponse> {
  const url = new URL(`${API_BASE}/game/reports/supervision/dashboard/cached/list`);
  url.searchParams.set('month', month);

  const res = await fetch(url.toString(), { headers: headers(token, clientId) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSupervisionDashboardByTeam(
  token: string,
  clientId: string,
  teamId: number | string,
  month: string,
): Promise<SupervisionTeamDashboardCached> {
  const url = new URL(`${API_BASE}/game/reports/supervision/dashboard/cached`);
  url.searchParams.set('team_id', String(teamId));
  url.searchParams.set('month', month);

  const res = await fetch(url.toString(), { headers: headers(token, clientId) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

### React Query (exemplo)

```typescript
// Lista — chave estável por client + month
useQuery({
  queryKey: ['supervision-dashboard-list', clientId, month],
  queryFn: () => fetchSupervisionDashboardList(token, clientId, month),
  enabled: Boolean(token && clientId && month),
});

// Detalhe — só se não reutilizar dados da lista
useQuery({
  queryKey: ['supervision-dashboard', clientId, teamId, month],
  queryFn: () => fetchSupervisionDashboardByTeam(token, clientId, teamId, month),
  enabled: Boolean(token && clientId && teamId && month),
});
```

---

## Comparação rápida: jogador vs supervisão

| | Jogador | Supervisão |
|---|---------|------------|
| Escopo | `email` | `team_id` |
| Lista | — | `.../cached/list` |
| Detalhe | `.../dashboard/cached` | `.../supervision/dashboard/cached` |
| Roles | PLAYER, ADMIN, GESTOR, SERVICE | ADMIN, GESTOR, SERVICE |
| Campos extras | — | `team_id`, `team_name`, `players_count` |
| Fonte dos dados | RPC em `user_action` | Soma do cache de jogadores |

---

## Checklist de migração

- [ ] Identificar telas de supervisão que chamam `finished/summary`, `open/summary` ou `goal/month/summary` com `team_id`.
- [ ] Substituir grade de times por **uma** chamada a `supervision/dashboard/cached/list`.
- [ ] Mapear KPIs com a mesma tabela do painel do jogador (+ `players_count`, `team_name`).
- [ ] Remover montagem de `finished_at_*` / `dt_prazo_*` no front para KPIs de supervisão.
- [ ] Tratar `teams: []` e **404** no detalhe com mensagens distintas.
- [ ] Garantir que rotas de supervisão não sejam usadas com role **PLAYER**.
- [ ] Drill-down para jogador: usar `dashboard/cached` + `finished/deliveries/cached` com `email`.
- [ ] Exibir subtítulo com `params.month_start`–`params.month_end` e temporada.
- [ ] Coordenar com backend novos meses no seletor (refresh `--all --month=` + agregação de times).

---

## Disponibilidade dos dados

1. Rodar refresh dos **jogadores** do mês:  
   `npm run dashboard-cache:refresh-once -- --all --month=2026-05`
2. A agregação por time roda **no final** do mesmo script ou isolada:  
   `npm run dashboard-cache:refresh-once -- --teams-only --month=2026-05`

Sem passo 1, a supervisão fica vazia ou desatualizada.

---

## Swagger

Tag **Game** em `/api`:

- **Supervisão: dashboard do time (cache agregado)** — `GET /game/reports/supervision/dashboard/cached`
- **Supervisão: lista de times com dashboard em cache** — `GET /game/reports/supervision/dashboard/cached/list`

Modelos: `TeamSupervisionDashboardCachedReportResponseModel`, `TeamSupervisionDashboardCachedListResponseModel`, `GameReportSupervisionCachedQueryModel`.
