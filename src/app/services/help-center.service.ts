import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, tap, catchError, shareReplay } from 'rxjs/operators';

import {
  HelpCenterContent,
  HelpCenterModule,
  HelpCenterSearchResult,
} from '@model/help-center.types';
import { FeaturesService } from '@services/features.service';
import { UserProfileService } from '@services/user-profile.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfile } from '@utils/user-profile';

@Injectable({
  providedIn: 'root',
})
export class HelpCenterService {
  private content$ = new BehaviorSubject<HelpCenterContent | null>(null);
  private loadPromise: Observable<HelpCenterContent> | null = null;

  constructor(
    private http: HttpClient,
    private translate: TranslateService,
    private featuresService: FeaturesService,
    private userProfileService: UserProfileService,
    private sessao: SessaoProvider
  ) {}

  loadContent(): Observable<HelpCenterContent> {
    if (this.content$.value) {
      return of(this.content$.value);
    }

    if (!this.loadPromise) {
      const locale = this.resolveLocale();
      this.loadPromise = this.http
        .get<HelpCenterContent>(`assets/help-center/${locale}.json`)
        .pipe(
          catchError(() =>
            this.http.get<HelpCenterContent>('assets/help-center/pt-BR.json')
          ),
          tap(content => this.content$.next(content)),
          shareReplay(1)
        );
    }

    return this.loadPromise;
  }

  getVisibleModules(): Observable<HelpCenterModule[]> {
    return this.loadContent().pipe(
      map(content => this.filterModules(content.modules))
    );
  }

  getModuleBySlug(slug: string): Observable<HelpCenterModule | null> {
    return this.getVisibleModules().pipe(
      map(modules => modules.find(m => m.slug === slug) ?? null)
    );
  }

  search(query: string): Observable<HelpCenterSearchResult[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return of([]);
    }

    return this.getVisibleModules().pipe(
      map(modules => this.searchModules(modules, normalized))
    );
  }

  isModuleVisible(module: HelpCenterModule): boolean {
    return this.filterModules([module]).length > 0;
  }

  private filterModules(modules: HelpCenterModule[]): HelpCenterModule[] {
    const profile = this.userProfileService.getCurrentUserProfile();
    const roles = this.sessao.usuario?.roles;

    return modules
      .filter(module => this.matchesVisibility(module, profile, roles))
      .sort((a, b) => a.order - b.order);
  }

  private matchesVisibility(
    module: HelpCenterModule,
    profile: UserProfile,
    _roles: string[] | undefined
  ): boolean {
    const audience = module.audience ?? 'jogador';

    if (audience === 'supervisor' && !this.canSeeSupervisorContent(profile)) {
      return false;
    }

    if (module.featureFlag && !this.featuresService.isFeatureEnabled(module.featureFlag)) {
      return false;
    }

    return true;
  }

  private canSeeSupervisorContent(_profile: UserProfile): boolean {
    return this.userProfileService.canAccessTeamManagement();
  }

  private searchModules(
    modules: HelpCenterModule[],
    query: string
  ): HelpCenterSearchResult[] {
    const results: HelpCenterSearchResult[] = [];

    for (const module of modules) {
      const moduleText = `${module.title} ${module.description} ${module.intro}`.toLowerCase();
      const matchedArticles = module.articles.filter(article => {
        const articleText = `${article.title} ${article.body}`.toLowerCase();
        return articleText.includes(query);
      });

      if (moduleText.includes(query)) {
        results.push({
          module,
          matchedArticles: matchedArticles.length ? matchedArticles : module.articles,
          matchType: 'module',
        });
      } else if (matchedArticles.length) {
        results.push({
          module,
          matchedArticles,
          matchType: 'article',
        });
      }
    }

    return results;
  }

  private resolveLocale(): string {
    const lang = (this.translate.currentLang || this.translate.defaultLang || 'pt-BR')
      .replace('_', '-');
    return lang === 'en-US' ? 'en-US' : 'pt-BR';
  }
}
