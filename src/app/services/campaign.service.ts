import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { joinApiPath } from 'src/environments/backend-url';

export interface Campaign {
  id: number;
  created_at: string;
  name: string;
  client_id: string;
  starts_at: string;
  finishes_at: string;
  /** Campanha sintética quando a API não responde ou não há dados. */
  isDefault?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CampaignService {
  private currentCampaign: Campaign | null = null;
  private isLoading = false;
  private loadPromise: Promise<Campaign> | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Pré-carrega campanha ao subir a app (login ou não), para datas já estarem em cache no dashboard.
   */
  prefetchCampaign(): void {
    void this.getCurrentCampaign().catch(() => undefined);
  }

  /**
   * Campanha atual: GET `/campaign`, escolhe a ativa pelo intervalo; fallback para temporada do ano.
   */
  async getCurrentCampaign(): Promise<Campaign> {
    if (this.currentCampaign) {
      return this.currentCampaign;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        const c = await this.fetchCurrentCampaign();
        this.currentCampaign = c;
        return c;
      } finally {
        this.isLoading = false;
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  private async fetchCurrentCampaign(): Promise<Campaign> {
    const rawBase = (environment.backend_url_base || '').trim().replace(/\/$/, '');
    if (!rawBase) {
      return this.getDefaultCampaign();
    }
    // HttpClient requires absolute URLs with protocol when calling external origins.
    // Keep compatibility with envs that provide only host[:port][/path].
    const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        ...(environment.client_id ? { client_id: environment.client_id } : {})
      });
      // Use joinApiPath to avoid malformed URLs when base has no trailing slash.
      const url = joinApiPath(base, '/campaign');
      const raw = await firstValueFrom(
        this.http.get<Campaign[] | { data?: Campaign[] }>(url, { headers })
      );
      const list = this.normalizeCampaignList(raw);
      const picked = this.selectActiveCampaign(list);
      if (picked) {
        return { ...picked, isDefault: false };
      }
    } catch (error) {
      console.warn('[Campaign] GET /campaign failed, using default season', error);
    }
    return this.getDefaultCampaign();
  }

  private normalizeCampaignList(raw: Campaign[] | { data?: Campaign[] }): Campaign[] {
    if (Array.isArray(raw)) {
      return raw;
    }
    const d = (raw as { data?: Campaign[] }).data;
    return Array.isArray(d) ? d : [];
  }

  /**
   * Campanha ativa: hoje ∈ [starts_at, finishes_at] (dias inclusivos, fuso local).
   * Senão, a próxima por `starts_at`; senão, a que terminou por último; senão, a primeira da lista.
   */
  private selectActiveCampaign(list: Campaign[]): Campaign | null {
    if (!list.length) {
      return null;
    }
    const now = Date.now();
    const parsed = list
      .map(c => ({
        c,
        start: this.parseStartOfDayLocal(c.starts_at).getTime(),
        end: this.parseEndOfDayLocal(c.finishes_at).getTime()
      }))
      .filter(x => Number.isFinite(x.start) && Number.isFinite(x.end));

    if (!parsed.length) {
      return list[0];
    }

    const inside = parsed.filter(x => now >= x.start && now <= x.end);
    if (inside.length) {
      inside.sort((a, b) => b.start - a.start);
      return inside[0].c;
    }

    const upcoming = parsed.filter(x => x.start > now).sort((a, b) => a.start - b.start);
    if (upcoming.length) {
      return upcoming[0].c;
    }

    const past = parsed.filter(x => x.end < now).sort((a, b) => b.end - a.end);
    return past[0]?.c ?? list[0];
  }

  private getDefaultCampaign(): Campaign {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), 0, 1);
    const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    return {
      id: 0,
      created_at: startDate.toISOString(),
      name: `Temporada ${now.getFullYear()}`,
      client_id: 'default',
      starts_at: this.formatToDateString(startDate),
      finishes_at: this.formatToDateString(endDate),
      isDefault: true
    };
  }

  async getCampaignStartDate(): Promise<Date> {
    const campaign = await this.getCurrentCampaign();
    return this.parseStartOfDayLocal(campaign.starts_at);
  }

  async getCampaignEndDate(): Promise<Date> {
    const campaign = await this.getCurrentCampaign();
    return this.parseEndOfDayLocal(campaign.finishes_at);
  }

  async getCampaignName(): Promise<string> {
    const campaign = await this.getCurrentCampaign();
    return campaign.name;
  }

  async getCampaignId(): Promise<number> {
    const campaign = await this.getCurrentCampaign();
    return campaign.id;
  }

  isLoadingCampaign(): boolean {
    return this.isLoading;
  }

  isCampaignLoaded(): boolean {
    return this.currentCampaign !== null;
  }

  clearCache(): void {
    this.currentCampaign = null;
    this.loadPromise = null;
  }

  async reloadCampaign(): Promise<Campaign> {
    this.clearCache();
    return this.getCurrentCampaign();
  }

  async isRealCampaign(): Promise<boolean> {
    const campaign = await this.getCurrentCampaign();
    return !campaign.isDefault;
  }

  async hasActiveRealCampaign(): Promise<boolean> {
    const campaign = await this.getCurrentCampaign();
    const now = new Date();
    const startDate = this.parseStartOfDayLocal(campaign.starts_at);
    const endDate = this.parseEndOfDayLocal(campaign.finishes_at);
    return now >= startDate && now <= endDate;
  }

  private parseStartOfDayLocal(dateString: string): Date {
    if (dateString?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = dateString.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const t = new Date(dateString);
    return Number.isNaN(t.getTime()) ? new Date() : t;
  }

  private parseEndOfDayLocal(dateString: string): Date {
    if (dateString?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = dateString.split('-').map(Number);
      return new Date(y, m - 1, d, 23, 59, 59, 999);
    }
    const t = new Date(dateString);
    if (Number.isNaN(t.getTime())) {
      return new Date();
    }
    t.setHours(23, 59, 59, 999);
    return t;
  }

  private formatToDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
