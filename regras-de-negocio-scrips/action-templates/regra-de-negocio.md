# Action templates → API Game4u

## Variáveis de ambiente

Copie a raiz do repositório [`.env.example`](../../.env.example) para `.env` e preencha (não commite `.env`).

| Variável | Descrição |
|----------|-----------|
| `BACKEND_URL_BASE` | Base da API **com** prefixo `/api`, ex.: `https://g4u-api-bwa.onrender.com/api` |
| `CLIENT_ID` | Cliente (ex.: `bwa`) |
| `GAME4U_LOGIN_EMAIL` / `GAME4U_LOGIN_PASSWORD` | Admin para autenticação (aliases aceitos pelo script: `G4U_ADMIN_*`, `MIGRATION_G4U_*`) |

## Fluxo

1. **Login:** `POST {BACKEND_URL_BASE}/auth/login` com header `client_id: <CLIENT_ID>`, body JSON `{ "email", "password" }`. Resposta: token em `access_token` (ou equivalente).
2. **Criar action template:** `POST {BACKEND_URL_BASE}/action` com o mesmo `client_id`, header `Authorization: Bearer <token>`, e o payload abaixo.

### Exemplo de payload

```json
{
  "id": "atv1_01",
  "created_at": "2024-03-20T10:00:00Z",
  "points": 3,
  "criteria": {
    "executionTime": 1,
    "complexity": 3,
    "seniorityLevel": 1,
    "importance": 1
  },
  "title": "Completar o tutorial",
  "integration_id": null,
  "deactivated_at": null
}
```

## CSVs

Processar estes arquivos na pasta `action-templates`:

- `action-template-pagina1.csv`
- `action-template-pagina2.csv`
- `action-template-pagina 3.csv` (nome com espaço antes do `3`)

Cada linha (coluna **`nome`**) vira um template. Para todas as linhas:

- `points` = **3**
- `criteria` = **sempre** o objeto acima

O script gera `id` (estável por arquivo + índice + título) e `created_at` em ISO; ver `migration-tools`.

## Script

Na pasta `regras-de-negocio-scrips/migration-tools`:

```bash
npm run action-templates:upload:dry
npm run action-templates:upload
```

Opções: `--dry-run`, `--csv-dir <pasta>`, `--help`.

Documentação da API: https://g4u-api-bwa.onrender.com/api
