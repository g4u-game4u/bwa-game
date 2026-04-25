1. buscar companies com 'status = 'Ativa' dos arquivos json na pasta "get-organograma-from-supabase".

2. decupar a coluna 'responsaveis'.

3. Criar uma lista de departamentos distintos possíveis e pessoas (nome e e-mail) distintas possíveis em cada time

4. Criar tabela com nome, email e departamento



## Execução (script)



A partir da raiz do repositório:



```bash

cd regras-de-negocio-scrips/migration-tools

npm run organogram:from-json

```



Lê todos os `companies_rows*.json` em `get-organograma-from-supabase` (ou `--input-dir`), grava em `get-organograma-from-supabase/out/`:



- `organograma-pessoas.csv` — cabeçalho: `cnpj,fantasia,nome,email,departamento` (uma linha por combinação distinta na empresa; empresas repetidas em vários ficheiros são fundidas por CNPJ). Também é gerado `organograma-pessoas.xlsx` (mesmo conteúdo, uma folha).

- `organograma-departamentos-pessoas.csv` — cabeçalho: `departamento,nome,email`: vista global (sem empresa), com pessoas distintas por departamento (mesmo nome de departamento em empresas diferentes é fundido pela chave em minúsculas; pessoa distinta por e-mail, ou por nome se não houver e-mail). Também `organograma-departamentos-pessoas.xlsx`.

- `organograma-por-empresa.json` — por empresa: `cnpj`, `fantasia`, `razao_social`, `departamentos[]`, `pessoas[]` com `{ nome, email }` distintos por e-mail.



Opções: `--out-dir <pasta>`, `--exclude-placeholder` (remove entradas tipo `sem.responsavel@bwa.global`). Ver `npm run organogram:from-json -- --help`.

Para converter **só** os CSV desta pasta (recursivo, p.ex. `out/`) em `.xlsx` ao lado de cada ficheiro:

```bash
cd regras-de-negocio-scrips/migration-tools
npm run organogram:csv-to-xlsx
```

Por defeito procura `.csv` em `get-organograma-from-supabase`. Use `npm run organogram:csv-to-xlsx -- --dir caminho/para/pasta`.

