# Lake / Snowflake indisponível — integração frontend (toast + retry)

Guia para tratar **`503 Service Unavailable`** nas rotas de relatório que leem o data lake (Snowflake), sem confundir com sessão expirada.

Relacionado: [management-dashboard-cached-frontend.md](./management-dashboard-cached-frontend.md), [supervision-dashboard-cached-frontend.md](./supervision-dashboard-cached-frontend.md), [player-dashboard-cached-frontend.md](./player-dashboard-cached-frontend.md).

---

## Resumo

| Conceito | Detalhe |
|----------|---------|
| Status HTTP | **`503`** (não é 401 — sessão do usuário continua válida) |
| Quando ocorre | Conexão Snowflake expirou e o backend **não conseguiu** reconectar na 2ª tentativa |
| Comportamento do backend | 1ª falha por conexão morta → reconecta e repete a query automaticamente; só expõe 503 se ainda falhar |
| Ação no front | Toast amigável + permitir **tentar de novo** (refresh / retry manual ou automático 1x) |
| **Não fazer** | Pedir relogin, limpar token ou redirecionar para `/login` |

---

## Contrato da API

### Resposta `503`

```json
{
  "statusCode": 503,
  "message": "Não foi possível carregar os dados agora. Tente novamente em instantes.",
  "path": "/game/reports/user-actions?month=2026-06&...",
  "timestamp": "2026-06-07T20:32:53.000Z"
}
```

### Constante (espelhar no front)

```typescript
export const SNOWFLAKE_UNAVAILABLE_MESSAGE =
  'Não foi possível carregar os dados agora. Tente novamente em instantes.';
```

Use `statusCode === 503` **ou** `message === SNOWFLAKE_UNAVAILABLE_MESSAGE` para identificar o caso (preferir status).

---

## Rotas afetadas

Qualquer `GET` sob **`/game/reports/**`** que use cache do lake (Snowflake), por exemplo:

| Área | Exemplos |
|------|----------|
| Jogador | `.../dashboard/cached`, `.../finished/deliveries/cached` |
| Supervisão | `.../supervision/dashboard/cached`, `.../supervision/dashboard/cached/list` |
| Gestão | `.../management/dashboard/cached/overview`, `.../management/finished/deliveries/cached` |
| Listas / drill-down | `.../user-actions`, `.../finished/actions-by-delivery`, `.../team/daily-finished-stats` |

Rotas que **só** leem Supabase (sem lake) **não** retornam este 503.

---

## Tabela de erros (atualizar guias existentes)

| Status | Quando | Ação no front |
|--------|--------|----------------|
| **503** | Lake temporariamente indisponível | Toast + retry; **manter sessão** |
| **401** | Token inválido / expirado | Renovar sessão ou redirect login |
| **403** | Sem permissão no escopo | Bloquear UI / voltar |
| **404** | Cache do mês não encontrado | Empty state / “dados ainda não disponíveis” |
| **500** | Erro inesperado | Toast genérico; não tratar como logout |

---

## Onde implementar no front

Siga o padrão já usado nos serviços de relatório (`fetch` + `if (!res.ok)` + React Query). A mudança deve ser **centralizada** para não repetir toast em cada tela.

### 1. Tipo de erro da API

```typescript
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  path?: string;
  timestamp?: string;
  errors?: string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isSnowflakeUnavailable(): boolean {
    return this.statusCode === 503;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}
```

### 2. Helper no client HTTP (recomendado)

Substituir o `throw new Error(body.message ?? ...)` dos exemplos em [supervision-dashboard-cached-frontend.md](./supervision-dashboard-cached-frontend.md) por algo assim:

```typescript
async function parseApiResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  throw new ApiError(
    body.message ?? `HTTP ${res.status}`,
    body.statusCode ?? res.status,
    body,
  );
}

// Uso nos fetch* de relatório:
export async function fetchSupervisionDashboardList(/* ... */) {
  const res = await fetch(url.toString(), { headers: headers(token, clientId) });
  return parseApiResponse<SupervisionDashboardCachedListResponse>(res);
}
```

### 3. Handler global de toast (um lugar só)

Encaixar no mesmo ponto onde o projeto já trata **401** (interceptor axios, wrapper `apiClient`, ou `QueryClient` `defaultOptions.queries.onError` / provider de erros):

```typescript
import { toast } from 'sonner'; // ou o toast que o projeto já usa

export function handleApiError(error: unknown): void {
  if (!(error instanceof ApiError)) {
    toast.error('Algo deu errado. Tente novamente.');
    return;
  }

  if (error.isUnauthorized) {
    // fluxo existente: refresh token ou redirect login
    return;
  }

  if (error.isSnowflakeUnavailable) {
    toast.warning(error.message, {
      id: 'snowflake-unavailable', // evita spam de toasts iguais
      duration: 6000,
    });
    return;
  }

  toast.error(error.message);
}
```

**Variante sugerida:** `warning` (amarelo) em vez de `error` (vermelho), para deixar claro que não é falha de autenticação.

### 4. React Query — `onError` nas queries de relatório

Se o projeto usa React Query como nos guias de cache:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // 1 retry automático só para 503 (backend já tentou reconectar 1x)
        if (error instanceof ApiError && error.isSnowflakeUnavailable) {
          return failureCount < 1;
        }
        return false;
      },
      retryDelay: 1500,
    },
  },
});

// Em cada useQuery de /game/reports/* (ou no wrapper hook):
useQuery({
  queryKey: ['user-actions', clientId, month, teamId],
  queryFn: () => fetchUserActions(token, clientId, params),
  onError: handleApiError,
});
```

**Importante:** com o retry do React Query, o toast só deve aparecer **depois** do retry falhar — use `onError` (não `onSettled`) ou configure `meta: { suppressToastOnRetry: true }` se já tiver esse padrão.

### 5. Botão “Tentar novamente” na tela (opcional)

Para telas com empty/error state:

```typescript
{isError && error instanceof ApiError && error.isSnowflakeUnavailable && (
  <Button variant="outline" onClick={() => refetch()}>
    Tentar novamente
  </Button>
)}
```

---

## UX — copy do toast

| Campo | Valor |
|-------|--------|
| Título / mensagem | `Não foi possível carregar os dados agora. Tente novamente em instantes.` |
| Tom | Informativo / aviso — **não** “sessão expirada” |
| Ação secundária (opcional) | Botão “Tentar novamente” chamando `refetch()` |

Não exibir: “Faça login novamente”, “Sessão expirada”, “Erro interno do servidor”.

---

## Checklist de implementação

- [ ] Criar `ApiError` + `parseApiResponse` no client HTTP compartilhado.
- [ ] Centralizar `handleApiError` (mesmo lugar do tratamento de 401).
- [ ] Toast **503** com `toast.warning` e `id` fixo para deduplicar.
- [ ] **Não** redirecionar para login em 503.
- [ ] (Opcional) `retry: 1` no React Query para queries `/game/reports/**`.
- [ ] (Opcional) Botão “Tentar novamente” no error state das telas de dashboard.
- [ ] Atualizar tabela de erros nos guias: [management](./management-dashboard-cached-frontend.md), [supervisão](./supervision-dashboard-cached-frontend.md), [jogador](./player-dashboard-cached-frontend.md).

---

## Teste manual

1. Deixe a API local ociosa por um longo período (ou simule queda do Snowflake).
2. Chame `GET /game/reports/user-actions?month=2026-06&...` com token válido.
3. **Cenário A (sucesso silencioso):** backend reconecta → **200** — front não precisa fazer nada.
4. **Cenário B (503):** resposta com `statusCode: 503` e `message` acima → toast de aviso, sessão intacta, `refetch` funciona após Snowflake voltar.

---

## Referência backend

- Reconexão automática: `src/infra/snowflake/snowflake.service.ts`
- Mensagem: constante `SNOWFLAKE_UNAVAILABLE_MESSAGE`
- Filtro HTTP: `src/infra/filters/http-exception.filter.ts` (expõe `message` no JSON)
