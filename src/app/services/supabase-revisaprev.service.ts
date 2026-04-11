import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Camada de acesso ao projeto Supabase RevisaPrev (URL + chaves em `environment.supabaseRevisaprev`).
 *
 * A API HTTP do MVP está documentada em [Game4U API](https://g4u-mvp-api.onrender.com/api#/);
 * consultas diretas ao Postgres via Supabase serão adicionadas neste serviço conforme necessário.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseRevisaprevService {
  private anonClient: SupabaseClient | null = null;
  private serviceRoleClient: SupabaseClient | null = null;

  private get revisaprev() {
    return environment.supabaseRevisaprev;
  }

  /** `true` se URL e chave anônima estão definidas (build / `.env`). */
  isAnonConfigured(): boolean {
    const { url, anonKey } = this.revisaprev;
    return !!(url?.trim() && anonKey?.trim());
  }

  /** `true` se URL e service role estão definidos. */
  isServiceRoleConfigured(): boolean {
    const { url, serviceRoleSecret } = this.revisaprev;
    return !!(url?.trim() && serviceRoleSecret?.trim());
  }

  /**
   * Cliente Supabase com a chave **anon** (respeita RLS). Preferir sempre no browser.
   */
  getAnonClient(): SupabaseClient {
    const { url, anonKey } = this.revisaprev;
    if (!url?.trim() || !anonKey?.trim()) {
      throw new Error(
        'Supabase RevisaPrev: configure SUPABASE_URL e SUPABASE_ANON_KEY.'
      );
    }
    if (!this.anonClient) {
      this.anonClient = createClient(url, anonKey);
    }
    return this.anonClient;
  }

  /**
   * Cliente com **service role** (ignora RLS). O segredo entra no bundle do front se usado aqui —
   * em produção pública use apenas em backend ou troque por sessão do usuário + anon key.
   */
  getServiceRoleClient(): SupabaseClient {
    const { url, serviceRoleSecret } = this.revisaprev;
    if (!url?.trim() || !serviceRoleSecret?.trim()) {
      throw new Error(
        'Supabase RevisaPrev: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_SECRET.'
      );
    }
    if (!this.serviceRoleClient) {
      this.serviceRoleClient = createClient(url, serviceRoleSecret);
    }
    return this.serviceRoleClient;
  }
}
