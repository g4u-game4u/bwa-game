# Insights de IA — relatório organizacional hierárquico

Guia para consumir insights gerados por IA a partir do cache do relatório organizacional, com memória em Supabase entre gerações.

Relacionado: [organization-hierarchy-report-frontend.md](./organization-hierarchy-report-frontend.md).

---

## Endpoints

### Cache (leitura)

```http
GET /game/reports/organization/hierarchy-insights?month=2026-06
Authorization: Bearer <token>
client_id: bwa
```

| Query | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | `YYYY-MM` ou `YYYY-MM-DD` (mesmo mês do relatório) |

**Roles:** `GERENTE`, `DIRETOR`, `C_LEVEL`, `ADMIN`, `SERVICE` (mesmo escopo do hierarchy-report).

### Geração (IA)

```http
POST /game/reports/organization/hierarchy-insights
Authorization: Bearer <token>
client_id: bwa
Content-Type: application/json

{ "month": "2026-06", "force": false }
```

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `month` | Sim | `YYYY-MM` |
| `force` | Não | Se `true`, regera mesmo com cache recente |

---

## Resposta `200 OK`

```typescript
interface OrganizationHierarchyInsightsResponse {
  month: string;
  generated_at: string;
  source?: 'cache' | 'generated';
  model?: string;
  summary?: string;
  insights: OrganizationHierarchyInsightItem[];
  memory_id?: string;
}

interface OrganizationHierarchyInsightItem {
  id?: string;
  category?: 'risk' | 'performance' | 'recommendation' | 'trend' | string;
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  node_type?: string;
  node_id?: string;
  node_label?: string;
}
```

---

## Erros

| Status | Quando |
|--------|--------|
| **404** | Ainda não há insights em cache para o mês |
| **402** / **429** | Créditos ou cota da API de IA esgotados |
| **403** | Papel não autorizado |
| **503** | Lake / provedor de IA indisponível |

Mensagens de crédito costumam conter `credit`, `quota`, `billing` ou `insufficient`.

---

## UI sugerida

1. Ao carregar o relatório, chamar **GET** (não bloqueia o restante da página).
2. Exibir cards por insight (`severity` → cor) + `summary` no topo.
3. Botão **Gerar insights** → **POST**; loading dedicado na seção.
4. **404** no GET → estado vazio com CTA para gerar.
5. **402/429** no POST → aviso de créditos esgotados; manter cache anterior se existir.
