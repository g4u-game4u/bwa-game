1. Devemos criar uma lista de usuários puxando da funifier 'funifier_basic_token' e 'funifier_api_key'. Depois comparar com a Lista de Casos(Lista Operação Completa) para encontrar a senha daqueles usuários e depois criar um json com todos os usuários com senha, para todos os usuários sem senha adicione a senha '123456'. (API DOC: https://api.funifier.com/).

2. Com esta lista em mãos, devemos rodar o script na pasta "hash-password" e salvar um novo arquivo com uma coluna a mais que é a senha hasheada. Por fim devemos criar um SQL de insert para criar esses usuários no meu supabase. Um exemplo do insert está em "insert-example-sql.md".

3. Devemos buscar uma lista de 'deliveries' no supabase 'https://zarptqqopvuwognexpon.supabase.co', parsear os dados e enviar como post para '/game/action/process' no 'backend_url_base' do game4u. (API DOC: https://g4u-api-bwa.onrender.com/api)

3.1. Abaixo segue as regras de negócio para o passo 3.
Schema: 'game4you'
Tabela: 'deliveries'

Schema da Tabela:
    - id
    - ent_id
    - company_id
    - company_cnpj
    - nome
    - competencia
    - dt_prazo
    - dt_atraso
    - dt_entrega
    - status_api
    - status_calc
    - guia_lida
    - department_id
    - respo_prazo (dono da user action enquanto ela estiver 'PENDING')
    - resp_entrega (dono da user action quando ela estiver 'DONE')
    - obligation_type
    - obligation_id
    - last_dh
    - synced_at
    - created_at
    - updated_at
    - user_email

Regra de negócio (PARSER)

    - Payload do Game4u:
        - status:
            - DONE: se 'resp_entrega' estiver preenchido
        - user_email:
            - igual a 'user_email' no supabase
        - action_title:
            - igual a 'nome' no supabase
        - delivery_id:
            - igual a 'company_id' + 'competencia'
        - delivery_title:
            - igual a nome da empresa (vamos precisar triangular o 'company_cnpj' com a coluna 'cnpj' da tabela 'companies').
        - integration_id:
            - igual a 'ent_id'.

## Scripts (migration-tools)

Na pasta [migration-tools](migration-tools): `npm install`, depois `npm run users:export`, `npm run users:sql`, `npm run deliveries:sync` (ver `--help` de cada script). **Lote completo (todos os jogadores Funifier + CSV):** `npm run users:export -- --out ./output/users-all.json` → `npm run users:sql -- --in ./output/users-all.json --out ./output/users-insert-full.sql` (rever o SQL antes de executar no Supabase). Por defeito o export **exclui** e-mails que contenham `@cidadania4u` ou `@gmail` (env `USERS_EXPORT_EXCLUDE_EMAIL_CONTAINS` com lista separada por vírgulas; `none` ou `false` = não excluir nada). O JSON inclui `fullName` (CSV **Nome** ou Funifier `extra`). O SQL gera `auth.users` (com `name` em `raw_user_meta_data`), `auth.identities`, **`public."user"`** (PK **`user_id`** = mesmo UUID que `auth.users.id`, porque `user_team_client.user_id` referencia essa coluna) e `public.user_team_client` (`client_id` **bwa**, `user_role` **player**). Cada `INSERT` termina com **`ON CONFLICT DO NOTHING`** (PostgreSQL 15+). Env opcional: `MIGRATION_APP_USER_ID_COLUMN` (default **user_id**), `MIGRATION_APP_USER_EMAIL_COLUMN` (default `email`), `MIGRATION_APP_USER_NAME_COLUMN` (default `full_name`). Variáveis: `.env` na raiz do repo (`FUNIFIER_BASIC_TOKEN`, `SUPABASE_URL`, chave Supabase, `SUPABASE_DB_SCHEMA` se não for `public`, `BACKEND_URL_BASE`, `CLIENT_ID`, credenciais `GAME4U_LOGIN_EMAIL` / `GAME4U_LOGIN_PASSWORD` para POST real).

### 4. Após criar utilizadores no Supabase (passo 3 do plano — deliveries → Game4U)

1. Confirma no `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ou anon com RLS que permita leitura), `SUPABASE_DB_SCHEMA` = **`game4you`** só se esse schema estiver **exposto** em Supabase → Settings → API → *Exposed schemas* (senão o PostgREST só vê `public` e falha com `PGRST106`). Ajusta `SUPABASE_DELIVERIES_TABLE` / `SUPABASE_COMPANIES_TABLE` se os nomes forem diferentes; o script espera colunas como em 3.1 (`ent_id`, `company_id`, `competencia`, `nome`, `company_cnpj`, `resp_entrega`, `user_email`, etc.).
2. **Amostra pequena (sem `--all`, sem POST):** `npm run deliveries:sync:sample` (equivale a `--dry-run --limit 5`) ou `npm run deliveries:sync -- --dry-run --limit 3`. Para rever JSON no disco: `npm run deliveries:sync -- --dry-run --limit 5 --out-payloads ./output/deliveries-sample-payloads.json`.
3. **Opcional:** gravar payloads em ficheiro para revisão: `npm run deliveries:sync -- --dry-run --all --out-payloads ./output/deliveries-payloads.json`.
4. **Sincronização real:** `npm run deliveries:sync -- --all --batch-post 100` (busca todas as linhas com paginação; envia ao backend em lotes). Ajusta `--page-size` ou `DELIVERIES_PAGE_SIZE` se o PostgREST limitar respostas.

O mapeamento segue a secção **3.1** deste documento (`status`, `user_email`, `delivery_id` = `company_id` + competência, `delivery_title` via `company_cnpj` → `companies`, etc.).
