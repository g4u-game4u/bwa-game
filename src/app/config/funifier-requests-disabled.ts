/**
 * REFATORAÇÃO: com `true`, desliga dados na Funifier (GET/POST/PUT/PATCH em FunifierApiService,
 * player/me, CNPJ lookup, userInfo — exceto login).
 *
 * Login do app: POST `/auth/login` na base `G4U_API_BASE` (AuthProvider.login). FunifierApiService.authenticate ainda usa POST `auth/token` quando chamado.
 *
 * Defina `false` para reativar toda a API Funifier.
 */
export const FUNIFIER_HTTP_DISABLED = true;
