ENV VARS
PORTAL_BWA_API_URL=https://api.bwa.global:3334
PORTAL_BWA_API_TOKEN=nsdPASDGFSYThfbhkjasdasdgfhkjgfbvpHJPh554974KJOsLJ565884524gamV5


1. Logar no PORTAL BWA (/api/autenticacao/obter-token-acesso/) com payloas 'email' e 'senha'. Pegar companies ativas do portal-bwa em todas as páginas (/api/empresas/listar-empresas/?limit=25&ativa_na_bwa=true), salvar em um json com cnpj, razao_social, classificacao, uf, forma_de_tributacao, cliente_em_onboarding e cliente_em_risco.

2. Baseado no level devemos dar mais ou menos pontos como se fosse um modificador para o usuário.
    - "classificacao": 1 -> peso 1 (stone)
    - "classificacao": 2 -> peso 2 (bronze)
    - "classificacao": 3 -> peso 3 (prata)
    - "classificacao": 4 -> peso 4 (ouro)
    - "classificacao": 5 -> peso 5 (diamante)

3. Atualizar as user-actions aplicando o peso às pontuações comparando delivery_title com razao social para encontrar a classificacao que deve ser aplicada.
| Variável | Descrição |
|----------|-----------|
| `BACKEND_URL_BASE` | Base da API **com** prefixo `/api`, ex.: `https://g4u-api-bwa.onrender.com/api` |
| `CLIENT_ID` | Cliente (ex.: `bwa`) |
| `GAME4U_LOGIN_EMAIL` / `GAME4U_LOGIN_PASSWORD` | Admin para autenticação

4. Salvar os dados do json no post /delivery dentro do extra (sem excluir o que já tiver lá)

4. Depois criar n8n que faz a mesma coisa periodicamente.