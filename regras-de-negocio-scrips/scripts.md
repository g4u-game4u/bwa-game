Documentação (Swagger) da API: https://g4u-mvp-api.onrender.com/api. Em **localhost** o backend costuma responder na raiz (ex.: `http://localhost:3001/auth/login`), sem o prefixo `/api` — veja `G4U_API_BASE` no runner.

Scripts single:
1. POST action template
- Criaremos primeiro as action templates conforme o arquivo @revisaprev-action-template.json

2. ⁠POST users e teams
- Ordem no runner (`seed-teams-users`): **POST /team** primeiro (líder temporário = admin do token, `GET /auth/user`), depois **POST /user** com `team_id` quando aplicável (`CreateUserModel`: email, password, full_name, user_role, opcional `avatar_url`), por fim **PUT /team/{id}** para definir o líder real de cada time.
- Opcional: `--reset-supabase-auth` remove no **Supabase Auth** os e-mails listados no seed (exceto `G4U_ADMIN_EMAIL`), exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_SECRET`.
- **Funifier (opcional):** se o backend usar `funifier_id` em `POST /team`, defina `funifier_id` no item ou `funifierIdEnv` (`G4U_FUNIFIER_TEAM_CS`, etc.).
- Senhas: @users-by-team-revisaprev.md; avatar global opcional: `G4U_SEED_AVATAR_URL` ou `seedDefaultAvatarUrl` no `api-scripts.config.json`.


### Zoho CRM API v8 (critérios e URLs)

Referência geral da coleção Postman: [API Collection v8](https://www.zoho.com/crm/developer/docs/api/v8/api-collection.html).

- **Search Records** — `GET {api-domain}/crm/v8/{module}/search?criteria=...` ([documentação](https://www.zoho.com/crm/developer/docs/api/v8/search-records.html)): critério no formato `CampoAPI:operador:valor`; para **datetime** com **between**, dois instantes **ISO 8601** separados por **vírgula** (ex. `Modified_Time:between:2024-02-01T18:52:56+00:00,2024-02-20T18:52:56+00:00`). Condições compostas: `((condição1) and (condição2))`. Vírgulas ou parênteses **dentro** do valor de busca exigem escape e encode. Paginação: **`page`** e **`per_page`** (padrão/máximo **200**); usar `info.more_records` para a próxima página.
- **Timeline do registro** — `GET .../Deals/{id}/__timeline` ([documentação](https://www.zoho.com/crm/developer/docs/api/v8/timeline-of-a-record.html)): na primeira página costuma-se usar **`sort_by=audited_time`**, **`per_page`**, **`filters`** (JSON com `audited_time` em `between`) e opcionalmente **`include_inner_details`** para enriquecer `field_history`. Chamada “nua” sem parâmetros pode retornar erro de parâmetro ausente conforme a org/API.
- O runner (`zoho-stages`) monta **criteria** a partir de `criteriaTemplate` no `api-scripts.config.json`, adiciona **page/per_page** na search e monta **query padrão** no `__timeline` alinhada ao intervalo `ZOHO_MODIFIED_*`. Para depuração: flag **`--zoho-timeline-bare`** ou env **`ZOHO_TIMELINE_BARE=1`**.

3. ⁠POST user action from ZOHO CRM BASEADO EM STAGES PARA TIMES CS/FINANCEIRO

- AUTH ZOHO:
    - POST em https://accounts.zoho.com/oauth/v2/token
    - Header: nenhum
    - BODY:
        - Content Type: Form Urlencoded
        - Body Parameters:
            - grant_type: refresh_token
            - client_id: ZOHO_CLIENT_ID (ENV VAR)
            - client_secret: ZOHO_CLIENT_SECRET (ENV VAR)
            - refresh_token: ZOHO_REFRESH_TOKEN (ENV VAR)

- Search DEALS ZOHO:
    - GET em https://www.zohoapis.com/crm/v8/Deals/search
    - Query Params: (Modified_Time:between: 2026-04-01T00:00:00ZZ, 2026-04-10T00:00:00ZZ)
    - Header: Authorization: Zoho-oauthtoken ZOHO OAuth Token
    - Observação: Atenção à PAGINAÇÃO

- Search DEALS DETAIL ZOHO
    - GET em https://www.zohoapis.com/crm/v8/Deals/{{ $json.id }}/__timeline
    - Header: Authorization: Zoho-oauthtoken ZOHO OAuth Token
    - Observação: Atenção à PAGINAÇÃO

- Montar PAYLOAD para GAME4U (runner `zoho-stages`)
    - **integration_id estável:** `zoho-deal-{dealId}-action-{actionTemplateId}` (o mesmo `action_id` enviado ao G4U). O runner **não** usa mais `timeline-{rowId}`.
    - **Transição de Stage** (`__timeline`): lê `old`/`new` do histórico; mapeia ambos em `zoho-crm-action-map.json` (`stageTitleToActionTemplateId`). Ordem: **DONE** do estágio anterior (se mapeado e elegível CS/Financeiro), depois **PENDING** do novo. Para **DONE**, o runner chama **GET `/user-action/search`** (filtros em `game4uUserActionSearch` no `api-scripts.config.json`) para obter o **mesmo** `created_at` da atividade `PENDING` antes de fechar — se não achar (ex.: registo legado com `integration_id` antigo), o DONE é omitido com aviso no log.
    - **CS vs Financeiro:** estágios em `stageResponsibleTeamOverrides` = `financeiro` só participam do ciclo DONE/PENDING se existir responsável financeiro resolvível (e fallback a Owner se configurado); caso contrário não cria ações financeiras por engano. Demais estágios usam **Owner** (CS).
    - **Replay + abril (diff):** `zoho-stages` com `--zoho-stage-replay-all-timeline` percorre **todas** as mudanças de Stage no `__timeline` (ordem cronológica), cada uma com **DONE** do `_value.old` mapeado e **PENDING** do `_value.new`. Com `--zoho-transitions-only-month 2026-04` ficam só linhas cujo `audited_time` cai nesse mês. `--deal-ids-csv historico-zoho-export/diff-….csv` hidrata deals por GET (em vez do search); `--deal-ids-csv-only-found-no` restringe aos `deal_id` onde o diff marcou `found_in_game4u=no`. Usar `--post-all-mapped` para não parar no primeiro deal com sucesso. Pipeline Cobrança continua em `zoho-cobranca-stages` (`--zoho-cobranca-all-transitions` já faz replay semelhante).
    - **Completar delivery:** se o **novo** Stage estiver em `zoho.stagesThatCompleteDelivery`, após os `process` o runner chama **POST** `/game/delivery/{deliveryId}/complete` com `{ finished_at }` (ver `gameDeliveryComplete` no config).
    - **Migração:** atividades já criadas com `zoho-deal-*-timeline-*` não batem o `integration_id` novo; ver `integrationIdRunnerNotes` no `api-scripts.config.json`.
    - Exemplo de corpo (alinhado ao front / `ProcessActionPayload`): `status`, `user_email`, `action_id`, `delivery_id`, `delivery_title`, `created_at`, `integration_id`, `comments` (só comentário de integração em **PENDING**), `finished_at` em **DONE**.

4.  ⁠POST user action from ZOHO CRM BASEADO EM TASKS (TAGS) PARA TIME JURÍDICO
- AUTH ZOHO:
    - POST em https://accounts.zoho.com/oauth/v2/token
    - Header: nenhum
    - BODY:
        - Content Type: Form Urlencoded
        - Body Parameters:
            - grant_type: refresh_token
            - client_id: ZOHO_CLIENT_ID (ENV VAR)
            - client_secret: ZOHO_CLIENT_SECRET (ENV VAR)
            - refresh_token: ZOHO_REFRESH_TOKEN (ENV VAR)

- Search DEALS ZOHO:
    - GET em https://www.zohoapis.com/crm/v8/Deals/search
    - Query Params: (Modified_Time:between: 2026-04-01T00:00:00ZZ, 2026-04-10T00:00:00ZZ)
    - Header: Authorization: Zoho-oauthtoken ZOHO OAuth Token
    - Observação: Atenção à PAGINAÇÃO

- Search DEALS DETAIL ZOHO PARA TASKS
    - GET em https://www.zohoapis.com/crm/v8/Deals/{{ $json.id }}/Activities_Chronological_View_History
    - Header: Authorization: Zoho-oauthtoken ZOHO OAuth Token
    - Observação: Atenção à PAGINAÇÃO

- Montar PAYLOAD para GAME4U (runner `zoho-tasks`)
    - Só deals com **Respons_vel_Jur** ou **Jur_dico_Respons_vel** preenchido; por defeito `user_email` = e-mail desse lookup (resolução via API de users do CRM quando necessário). Opcional: **`--zoho-tasks-task-owner-email`** ou **`G4U_ZOHO_JUR_TASK_USER_EMAIL=owner`** — usa o **Owner** da task Zoho (fallback para o jur do deal).
    - **GET** `Activities_Chronological_View_History`: o runner extrai a lista de atividades e, **por cada** `action_template_id` em **`tagFlowTitleToActionTemplateId`**, escolhe a atividade mais recente que casa com o mapa (desempate de ambiguidade entre tags).
    - **Status:** campo da task Zoho (ex. `Status`) mapeado para G4U via `zoho.jurActivitiesFromZoho.zohoTaskStatusToGame4uStatus` no config (fallback heurístico para “concluída” → DONE).
    - **integration_id estável:** `zoho-deal-{dealId}-jur-action-{actionTemplateId}`. Para **DONE**, o runner obtém `created_at` via **`/user-action/search`** como no fluxo de Stage; sem PENDING/CANCELLED correspondente ao mesmo `integration_id`, o DONE é omitido (a menos que `G4U_ZOHO_JUR_DONE_USE_TASK_CREATED_AT=1` ou `allowDoneUsingTaskCreatedAtWhenSearchMiss` no config).
    - **Diagnóstico:** `zoho-tasks --zoho-tasks-debug-summary` (sem POST) gera contagens e **`zoho-tasks-debug-summary.json`** na raiz do repo; `--zoho-tasks-debug-verbose`, `--zoho-tasks-debug-skip-game-lookup` se não houver API Game4U. **`npm run api-scripts:zoho-tasks:debug`** chama o mesmo modo.
    - Opções: `--no-post-process`, `--post-all-mapped`, `--max-deals`, filtro abril `--zoho-tasks-april-deals`, mesmo `pipelineFilter` que `zoho-stages` (intervalo `ZOHO_MODIFIED_*` salvo quando abril está desligado).

---

Configuração declarativa dos endpoints, variáveis de ambiente e mapeamentos para um runner futuro: **`api-scripts.config.json`** (mesma pasta que este arquivo).

### Execução passo a passo (API localhost)

Na raiz do repositório, com `G4U_API_BASE` (default `http://localhost:3001` no `api-scripts.config.json`) e `.env` com `G4U_ADMIN_EMAIL` / `G4U_ADMIN_PASSWORD` (ou `G4U_ACCESS_TOKEN`):

#### Ordem sugerida do fluxo

1. **`api-scripts:login`** (opcional) — confirma credenciais e token.
2. **`api-scripts:templates`** — `POST /action` a partir de `revisaprev-action-template.json` (em ambiente zero costuma ir **antes** do seed de usuários; depois do seed também funciona se o admin já existir).
3. **`api-scripts:users`** — times + usuários + líderes (`seed-teams-users`).
4. **`api-scripts:sync-template-points`** (opcional) — para templates **já** no banco: normaliza `criteria` (eixos) e recalcula `points` via `GET`+`PUT /action/{id}`.
5. **`api-scripts:zoho-stages`** — CRM Zoho: **`Deals/search` em todas as páginas** (`page` até `more_records=false`; teto `ZOHO_DEALS_SEARCH_MAX_PAGES`); por deal, **`__timeline` fundido** com **`page_token`**. Ciclo **DONE** + **PENDING** com **`integration_id`** estável; reenvios com o mesmo `integration_id` **devem atualizar** o registo no G4U (contrato `gameActionProcess.integrationUpsertNote` no config). **`api-scripts:zoho-tasks`** — mesmo search paginado; **atividades** com `page_token` em todas as páginas. Opcional **`--max-deals` / `ZOHO_MAX_DEALS`** para limitar quantos deals tratar após juntar o search. Mapa: **`zoho-crm-action-map.json`**. **`api-scripts:zoho-delivery-cancel-restore`** — replay de **todas** as mudanças de Stage no `__timeline`: **`POST /game/delivery/{dealId}/cancel`** quando `_value.new` é estágio perdido (config `deliveryCancelRestoreFromLostStages.cancelWhenNewStageNames`); **`POST .../restore`** quando `_value.old` é perdido e `_value.new` está nos estágios permitidos (chaves do mapa + extra; ver `api-scripts.config.json`).
6. **`api-scripts:probe-process`** — smoke test de `POST /game/action/process` com corpo de exemplo.

- `npm run api-scripts:login` — valida login e mostra trecho do token.
- `npm run api-scripts:templates` — `POST /action` para cada template (opções: `--dry-run`, `--from N`, `--limit M`, `--pause`, `--stop-on-error`). Após cada chamada o runner imprime **`▶▶ [i/n] Fim da operação`** com timestamp e trecho da resposta. Se a API responder **duplicate key** nos `id` do JSON, os templates já existem: use **`api-scripts:sync-template-points`** para alinhar `criteria`/`points` ou crie só os que faltam com `--from` / `--limit`.

**403 `User permissions not found`:** o token (ex.: login Supabase) autenticou, mas o backend não encontrou perfil/role **ADMIN** (ou equivalente) para esse usuário no contexto do `client_id`. É preciso criar/atualizar o registro de usuário na API (tabela `user` / permissões do cliente `revisaprev`) com papel de administrador, ou usar o fluxo de seed que o time usa em ambiente novo. Até lá, use `--stop-on-error` para não repetir dezenas de `POST` idênticos.
- `npm run api-scripts:users` — seed de times/usuários conforme `api-scripts.config.json` (fases `teams_bootstrap` → admins → líderes → players → `assign_team_leaders`). Opções: `--phase nome` | `all`, `--pause`, `--reset-supabase-auth` (e `--dry-run` junto para simular exclusões no Auth). O runner espera da API: **`POST /user`** com JSON (`user_id`, …) e/ou **`Location: /user/{user_id}`**; se o corpo vier vazio, **`GET /user/search?email=...`** (mesmo `client_id` no header) e listas (`GET /user` / search paginado). Não usa `exact_email` nem **`GET /user/by-email`** (em Nest, `by-email` antes de **`GET /user/:id`** senão vira UUID inválido).
- `npm run api-scripts:zoho-stages` / `api-scripts:zoho-tasks` / `api-scripts:zoho-delivery-cancel-restore` — Zoho + logs (env `ZOHO_*`, `ZOHO_MODIFIED_FROM`, `ZOHO_MODIFIED_TO`).
- `npm run api-scripts:probe-process` — testa `POST /game/action/process` com corpo de exemplo.

Implementação: **`run-api-scripts.mjs`** (mesma pasta).