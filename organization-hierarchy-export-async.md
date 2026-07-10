# Export assíncrono — relatório organizacional

Guia para backend (g4u-api-bwa), lake (`mozart-dashboard-cache-transforms`) e frontend (`bwa-game`).

Relacionado: [organization-hierarchy-report-frontend-by-backend-repository-25-06-26.md](./organization-hierarchy-report-frontend-by-backend-repository-25-06-26.md)

---

## Problema atual

Os exports server-side (`clients-served/export/xlsx` e `critical-clients/deliveries/export`) executam **consultas pesadas no Snowflake a cada clique**, geram o XLSX na hora e seguram a conexão HTTP até o arquivo inteiro estar pronto. Isso:

- Consome créditos/compute do data lake repetidamente
- Demora minutos em escopo organizacional
- No frontend legado, cancelava ao trocar de rota (`takeUntil(destroy$)` no componente)

---

## O que o frontend já implementa

| Peça | Arquivo |
|------|---------|
| Serviço global (sobrevive à navegação) | `src/app/services/org-hierarchy-export-job.service.ts` |
| Painel flutuante de progresso | `src/app/components/c4u-org-hierarchy-export-jobs/` |
| Tipos de API | `src/app/model/game4u-api.model.ts` |
| Feature flag | `environment.orgHierarchyAsyncExport` (`ORG_HIERARCHY_ASYNC_EXPORT`, default `true`) |

### Fluxo

1. UI chama `OrgHierarchyExportJobService.startClientsServedExport()` ou `startCriticalClientsDeliveriesExport()`
2. Se `POST .../exports` existir → cria job, faz **polling** a cada 2s em `GET .../exports/:jobId`, baixa em `GET .../exports/:jobId/download`
3. Se o backend retornar **404/405/501** → fallback automático para o GET síncrono legado (barra **indeterminada**), ainda **sem cancelar ao mudar de rota**
4. `job_id` fica em `sessionStorage` para retomar polling após refresh da página (mesma sessão)

---

## Contrato de API (backend — a implementar)

### 1. Criar job

```http
POST /game/reports/organization/hierarchy-report/exports
Content-Type: application/json
Authorization: Bearer …
```

```json
{
  "export_type": "clients_served_xlsx",
  "month": "2026-06",
  "node_type": "organization",
  "node_id": "bwa"
}
```

```json
{
  "export_type": "critical_clients_deliveries",
  "month": "2026-06",
  "node_type": "organization",
  "node_id": "bwa",
  "issue": "all",
  "company_serve_key": "12345678000199",
  "all_scoring_events": false
}
```

**Resposta `202 Accepted`:**

```json
{
  "job_id": "exp_01J…",
  "status": "queued",
  "estimated_seconds": 45
}
```

### 2. Status (polling)

```http
GET /game/reports/organization/hierarchy-report/exports/:jobId
```

```json
{
  "job_id": "exp_01J…",
  "status": "processing",
  "progress_pct": 62,
  "phase": "building_xlsx",
  "row_count": 4821,
  "filename": "clientes-atendidos-2026-06-bwa.xlsx",
  "expires_at": "2026-07-09T21:00:00Z"
}
```

| `status` | Significado |
|----------|-------------|
| `queued` | Na fila do worker |
| `processing` | Consultando / montando planilha |
| `completed` | Pronto para download |
| `failed` | `error_message` preenchido |
| `cancelled` | Cancelado (TTL ou admin) |

| `phase` sugerido | UI (frontend) |
|------------------|---------------|
| `queued` | Na fila |
| `reading_cache` | Lendo cache |
| `querying` | Consultando dados |
| `building_xlsx` | Gerando planilha |
| `uploading` | Preparando download |
| `finalizing` | Finalizando |

### 3. Download

```http
GET /game/reports/organization/hierarchy-report/exports/:jobId/download
```

- `200` + `Content-Disposition: attachment; filename="…"`
- Corpo: blob XLSX
- Após download ou `expires_at`, arquivo pode ser removido do storage temporário

### 4. Implementação sugerida no backend

```
POST /exports
  → valida escopo URT
  → grava job em Redis/Supabase (status=queued)
  → enfileira worker (BullMQ / fila interna / job Render)
  → retorna job_id

Worker:
  → status=processing, phase=reading_cache
  → lê mart de export (ver seção Lake abaixo) — NÃO reagregar do zero
  → phase=building_xlsx, atualiza progress_pct por lotes (ex.: a cada 500 linhas)
  → grava .xlsx em S3/disco temporário
  → status=completed, filename, expires_at
```

**TTL recomendado:** 1–24h para o arquivo; job `failed` com mensagem amigável.

Endpoints legados (`GET .../clients-served/export/xlsx` e `.../critical-clients/deliveries/export`) podem permanecer como atalho síncrono até o worker estar estável.

---

## Melhoria no data lake — evitar filtragem ad hoc

### Diagnóstico

O relatório principal já lê `bwa.mart_org_hierarchy_report_cache` (mart **13**). Os exports, porém, tendem a refazer joins/filtros em tabelas operacionais ou marts intermediários **por request**, o que:

- Dispara warehouse credits a cada export
- Não compartilha resultado entre usuários do mesmo mês
- Escala mal com milhares de clientes/entregas

### Recomendação principal: marts de export pré-materializados

Adicionar ao pipeline (`mozart-dashboard-cache-transforms`), **após o mart 13**:

| Mart | Nome sugerido | Granularidade | Uso |
|------|---------------|---------------|-----|
| **14** | `mart_org_clients_served_export` | 1 linha = 1 cliente atendido no MTD | Export Excel clientes |
| **15** | `mart_org_critical_client_deliveries_export` | 1 linha = 1 entrega (ou user_action se `all_scoring_events`) | Export entregas críticas |

**Colunas do mart 14** (alinhadas ao contrato atual do export):

- `cache_month`, `organization_id`, `node_type`, `node_id` (escopo hierárquico pré-resolvido ou colunas de diretoria/gerência/supervisão)
- `company_name`, `company_cnpj_digits`, `company_serve_key`
- `diretor_name`, `gerente_name`, `supervisor_name`
- `player_name`, `player_email`
- `classificacao_acessorias`, flags G4/onboarding/churn
- `served_at_mtd` (data atendimento MTD)

**Colunas do mart 15** (alinhadas ao drill-down `critical_client`):

- Chaves: `cache_month`, `company_serve_key`, `delivery_id`, `user_action_id` (opcional)
- `issue_kind`, títulos, datas, status, pontos, hierarquia, CNPJ

**Particionamento:** `cache_month` (e opcionalmente `organization_id`) para partition pruning.

**Refresh:** junto com `12 → 13` (mesma janela de materialização noturna ou pós-ETL).

### Query do worker/API após mart 14/15

```sql
SELECT *
FROM bwa.mart_org_clients_served_export
WHERE cache_month = :month
  AND (:node_type IS NULL OR node_type = :node_type)
  AND (:node_id IS NULL OR node_id = :node_id)
ORDER BY company_name;
```

- **Sem joins** em tempo de request
- **Sem agregações** — só filtro + ordenação em tabela estreita
- `progress_pct` = `rows_processed / total_rows * 90` + 10% para XLSX

### Opção complementar: arquivo pré-gerado no pipeline

Para escopo fixo `organization` + mês:

1. No job dbt/Airflow, após popular mart 14, gerar `.xlsx` e subir para object storage  
   `s3://…/org-exports/{month}/clients_served_organization_bwa.xlsx`
2. API async: se objeto existe e `generated_at` ≥ mart refresh → `status=completed` imediato com signed URL
3. Escopos `diretoria`/`gerencia`/filtros ad hoc → ainda usam mart 14 com `WHERE`, mas sem recomputar joins

**Ganho:** exports repetidos do mesmo mês custam **zero compute** adicional no lake.

### O que NÃO fazer

| Abordagem | Por quê evitar |
|-----------|----------------|
| Reconsultar fatos brutos (`user_actions`, `deliveries`) por export | Caro, lento, duplica lógica do mart 12/13 |
| Embutir listas gigantes no JSON do mart 13 | Infla cache, piora GET do relatório |
| Só cache HTTP de 15 min no API | Não reduz compute no primeiro request; não ajuda exports simultâneos |

### Paridade

Manter audit SQL (como `audit-query-org-hierarchy-parity.sql`) comparando:

- `COUNT(*)` mart 14 vs `mtd.clients_served` no mart 13 por escopo
- mart 15 vs soma `critical_clients` + drill-down `deliveries`

---

## Checklist de rollout

### Lake
- [ ] Criar `14_mart_org_clients_served_export.sql`
- [ ] Criar `15_mart_org_critical_client_deliveries_export.sql`
- [ ] Encadear após `13_mart_org_hierarchy_report_cache`
- [ ] Audit de paridade mês a mês

### Backend (g4u-api-bwa)
- [ ] `POST/GET .../exports` + worker
- [ ] Worker lê marts 14/15 (não lake cru)
- [ ] Storage temporário + `expires_at`
- [ ] Manter GET síncrono legado durante transição

### Frontend (já neste repo)
- [x] `OrgHierarchyExportJobService` + painel global
- [x] Fallback síncrono se API async ausente
- [x] Persistência `sessionStorage` para retomar polling

### Operação
- [ ] Monitorar duração média de jobs e tamanho de arquivo
- [ ] Alertar se mart 14/15 atrasado vs mart 13

---

## Comportamento para o usuário (após backend async)

| Ação | Resultado |
|------|-----------|
| Clica exportar e permanece na página | Painel mostra % e fase; download automático ao concluir |
| Navega para outra rota da SPA | Job continua; painel global segue visível |
| Recarrega a página (mesma aba) | Retoma polling via `sessionStorage` |
| Fecha a aba do navegador | Job no servidor pode terminar, mas download não ocorre |
| Segundo export do mesmo tipo enquanto um está ativo | Botão desabilitado (`hasActiveJob`) |
