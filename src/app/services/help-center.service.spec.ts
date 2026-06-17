import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';

import { HelpCenterService } from './help-center.service';
import { FeaturesService } from './features.service';
import { UserProfileService } from './user-profile.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfile } from '@utils/user-profile';
import { HelpCenterContent } from '@model/help-center.types';

describe('HelpCenterService', () => {
  let service: HelpCenterService;
  let httpMock: HttpTestingController;
  let featuresService: jasmine.SpyObj<FeaturesService>;
  let userProfileService: jasmine.SpyObj<UserProfileService>;
  let sessao: jasmine.SpyObj<SessaoProvider>;

  const mockContent: HelpCenterContent = {
    modules: [
      {
        slug: 'primeiros-passos',
        title: 'Primeiros passos',
        description: 'Intro',
        icon: 'ri-compass-3-line',
        theme: 'violet',
        order: 1,
        audience: 'jogador',
        intro: 'Intro',
        articles: [{ id: 'a1', title: 'Pontuação básica', body: 'texto sobre pontuação' }],
      },
      {
        slug: 'painel-supervisor',
        title: 'Painel Supervisor',
        description: 'Supervisor',
        icon: 'ri-user-star-line',
        theme: 'cyan',
        order: 7,
        audience: 'supervisor',
        intro: 'Visão supervisor',
        articles: [],
      },
      {
        slug: 'recompensas',
        title: 'Recompensas',
        description: 'Loja',
        icon: 'ri-gift-line',
        theme: 'gold',
        order: 10,
        audience: 'jogador',
        featureFlag: 'enableVirtualStore',
        intro: 'Loja virtual',
        articles: [],
      },
    ],
  };

  beforeEach(() => {
    featuresService = jasmine.createSpyObj('FeaturesService', ['isFeatureEnabled']);
    userProfileService = jasmine.createSpyObj('UserProfileService', [
      'getCurrentUserProfile',
      'canAccessTeamManagement',
    ]);
    sessao = jasmine.createSpyObj('SessaoProvider', [], { usuario: { roles: [] } });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [
        HelpCenterService,
        { provide: FeaturesService, useValue: featuresService },
        { provide: UserProfileService, useValue: userProfileService },
        { provide: SessaoProvider, useValue: sessao },
      ],
    });

    service = TestBed.inject(HelpCenterService);
    httpMock = TestBed.inject(HttpTestingController);
    userProfileService.getCurrentUserProfile.and.returnValue(UserProfile.JOGADOR);
    userProfileService.canAccessTeamManagement.and.returnValue(false);
    featuresService.isFeatureEnabled.and.returnValue(false);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushContent(): void {
    const req = httpMock.expectOne('assets/help-center/pt-BR.json');
    req.flush(mockContent);
  }

  it('should show jogador modules and hide supervisor modules for JOGADOR', (done) => {
    userProfileService.getCurrentUserProfile.and.returnValue(UserProfile.JOGADOR);
    userProfileService.canAccessTeamManagement.and.returnValue(false);

    service.getVisibleModules().subscribe(modules => {
      const slugs = modules.map(m => m.slug);
      expect(slugs).toContain('primeiros-passos');
      expect(slugs).not.toContain('painel-supervisor');
      done();
    });
    flushContent();
  });

  it('should show supervisor modules for ADMIN with JOGADOR profile', (done) => {
    userProfileService.getCurrentUserProfile.and.returnValue(UserProfile.JOGADOR);
    userProfileService.canAccessTeamManagement.and.returnValue(true);

    service.getVisibleModules().subscribe(modules => {
      expect(modules.some(m => m.slug === 'painel-supervisor')).toBeTrue();
      done();
    });
    flushContent();
  });

  it('should show both jogador and supervisor modules for SUPERVISOR', (done) => {
    userProfileService.getCurrentUserProfile.and.returnValue(UserProfile.SUPERVISOR);
    userProfileService.canAccessTeamManagement.and.returnValue(true);

    service.getVisibleModules().subscribe(modules => {
      const slugs = modules.map(m => m.slug);
      expect(slugs).toContain('primeiros-passos');
      expect(slugs).toContain('painel-supervisor');
      done();
    });
    flushContent();
  });

  it('should show supervisor modules for GESTOR', (done) => {
    userProfileService.getCurrentUserProfile.and.returnValue(UserProfile.GESTOR);
    userProfileService.canAccessTeamManagement.and.returnValue(true);

    service.getVisibleModules().subscribe(modules => {
      expect(modules.some(m => m.slug === 'painel-supervisor')).toBeTrue();
      done();
    });
    flushContent();
  });

  it('should filter modules by feature flag', (done) => {
    service.getVisibleModules().subscribe(modules => {
      const slugs = modules.map(m => m.slug);
      expect(slugs).toContain('primeiros-passos');
      expect(slugs).not.toContain('recompensas');
      done();
    });
    flushContent();
  });

  it('should include feature-flagged module when enabled', (done) => {
    featuresService.isFeatureEnabled.and.callFake(flag => flag === 'enableVirtualStore');

    service.getVisibleModules().subscribe(modules => {
      expect(modules.some(m => m.slug === 'recompensas')).toBeTrue();
      done();
    });
    flushContent();
  });

  it('should return null for hidden module slug', (done) => {
    userProfileService.getCurrentUserProfile.and.returnValue(UserProfile.JOGADOR);
    userProfileService.canAccessTeamManagement.and.returnValue(false);

    service.getModuleBySlug('painel-supervisor').subscribe(module => {
      expect(module).toBeNull();
      done();
    });
    flushContent();
  });

  it('should search articles by query', (done) => {
    service.search('pontuação').subscribe(results => {
      expect(results.length).toBe(1);
      expect(results[0].module.slug).toBe('primeiros-passos');
      expect(results[0].matchedArticles.length).toBe(1);
      done();
    });
    flushContent();
  });

  it('should resolve module by slug', (done) => {
    service.getModuleBySlug('primeiros-passos').subscribe(module => {
      expect(module?.title).toBe('Primeiros passos');
      done();
    });
    flushContent();
  });
});
