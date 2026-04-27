ENV VARS (preencher no `.env` da raiz do repo; ver [.env.example](../../.env.example)):

- `BACKEND_URL_BASE` — base da API Game4u **com** `/api`, ex.: `https://g4u-api-bwa.onrender.com/api`
- `CLIENT_ID` — ex.: `bwa`
- `GAME4U_LOGIN_EMAIL`, `GAME4U_LOGIN_PASSWORD` — admin (aliases: `G4U_ADMIN_*`, `MIGRATION_G4U_*`)

3. Devemos buscar uma lista de 'deliveries' no supabase 'https://zarptqqopvuwognexpon.supabase.co', parsear os dados, logar como admin e enviar os user-actions como post para '/game/action/process' no 'backend_url_base' do game4u. (API DOC: https://g4u-api-bwa.onrender.com/api)

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