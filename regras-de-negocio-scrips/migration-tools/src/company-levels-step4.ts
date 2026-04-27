/**
 * Só o passo 4 (sem novos GETs portal/gamificação): lê `out/portal-empresas.json` e
 * `out/gamificacao-empresas.json`, recalcula e grava `out/company-completo.json`, depois
 * GET/PUT em Game4U `/delivery` (listagem + item por id; paths configuráveis). Sem portal/gamificação na rede.
 *
 * Uso (na pasta migration-tools):
 *   npm run company-levels:step4
 *   npm run company-levels:step4 -- --max-puts 10
 *   npm run company-levels:step4 -- --dry-run --max-puts 1
 *   npm run company-levels:step4 -- --out-dir "C:\caminho\out"
 */
process.argv.splice(2, 0, '--reuse-json', '--apply-deliveries');
require('./company-levels-delivery-extra');
