import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { HelpCenterModule } from '@model/help-center.types';
import { HelpCenterService } from '@services/help-center.service';
import { UserProfileService } from '@services/user-profile.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { canAccessOrganizationHierarchyNav } from '@utils/org-hierarchy-report-role';

const MOBILE_MAX_WIDTH = 767;
const COMPACT_MOBILE_MAX_WIDTH = 425;
const TABLET_MAX_WIDTH = 1023;
const DESKTOP_MIN_WIDTH = 1024;
const LAST_DASHBOARD_KEY = 'lastVisitedDashboard';

@Component({
  selector: 'app-help-center',
  templateUrl: './help-center.component.html',
  styleUrls: ['./help-center.component.scss'],
})
export class HelpCenterComponent implements OnInit, OnDestroy {
  modules: HelpCenterModule[] = [];
  sidebarOpen = true;
  isMobileLayout = false;
  isCompactMobileLayout = false;
  modulePickerOpen = false;
  activeModuleSlug = '';

  @ViewChild('modulePicker') modulePickerRef?: ElementRef<HTMLElement>;

  private destroy$ = new Subject<void>();
  private mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
  private compactQuery = window.matchMedia(
    `(max-width: ${COMPACT_MOBILE_MAX_WIDTH}px)`
  );
  private tabletQuery = window.matchMedia(
    `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`
  );
  private readonly onViewportChange = (): void => this.applyViewportLayout();

  constructor(
    private helpCenterService: HelpCenterService,
    private router: Router,
    private userProfileService: UserProfileService,
    private sessaoProvider: SessaoProvider
  ) {}

  ngOnInit(): void {
    this.syncActiveModuleFromUrl(this.router.url);
    this.applyViewportLayout();
    this.mobileQuery.addEventListener('change', this.onViewportChange);
    this.compactQuery.addEventListener('change', this.onViewportChange);
    this.tabletQuery.addEventListener('change', this.onViewportChange);

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(event => this.syncActiveModuleFromUrl(event.urlAfterRedirects));

    this.helpCenterService.getVisibleModules().subscribe(modules => {
      this.modules = modules;
    });
  }

  ngOnDestroy(): void {
    this.mobileQuery.removeEventListener('change', this.onViewportChange);
    this.compactQuery.removeEventListener('change', this.onViewportChange);
    this.tabletQuery.removeEventListener('change', this.onViewportChange);
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  toggleModulePicker(event: Event): void {
    event.stopPropagation();
    this.modulePickerOpen = !this.modulePickerOpen;
  }

  closeModulePicker(): void {
    this.modulePickerOpen = false;
  }

  selectModule(slug: string): void {
    this.closeModulePicker();

    if (slug === this.activeModuleSlug) {
      return;
    }

    if (slug) {
      this.router.navigate(['/dashboard/help', slug]);
    } else {
      this.router.navigate(['/dashboard/help']);
    }
  }

  navigateBackToDashboard(): void {
    const route = this.resolveDashboardRoute();
    this.router.navigate([route]);
  }

  trackBySlug(_index: number, module: HelpCenterModule): string {
    return module.slug;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.modulePickerOpen) {
      return;
    }

    const target = event.target as Node | null;
    if (target && this.modulePickerRef?.nativeElement.contains(target)) {
      return;
    }

    this.closeModulePicker();
  }

  private syncActiveModuleFromUrl(url: string): void {
    const match = url.match(/\/dashboard\/help(?:\/([^/?#]+))?/);
    this.activeModuleSlug = match?.[1] ?? '';
  }

  private resolveDashboardRoute(): string {
    try {
      const lastDashboard = sessionStorage.getItem(LAST_DASHBOARD_KEY);
      if (lastDashboard && !lastDashboard.startsWith('/dashboard/help')) {
        return lastDashboard;
      }
    } catch {
      // ignore storage errors
    }

    if (this.userProfileService.isSupervisor()) {
      return '/dashboard/supervisor';
    }

    if (
      this.userProfileService.isJogador() ||
      this.userProfileService.isLiderCelula()
    ) {
      return '/dashboard';
    }

    if (canAccessOrganizationHierarchyNav(this.sessaoProvider.usuario?.roles)) {
      return '/dashboard/organization-hierarchy';
    }

    return '/dashboard';
  }

  private applyViewportLayout(): void {
    const isMobile = this.mobileQuery.matches;
    const isCompact = this.compactQuery.matches;
    const isTablet = this.tabletQuery.matches;
    this.isMobileLayout = isMobile;
    this.isCompactMobileLayout = isCompact;

    if (!isCompact) {
      this.closeModulePicker();
    }

    if (isMobile) {
      this.sidebarOpen = false;
    } else if (window.innerWidth >= DESKTOP_MIN_WIDTH) {
      this.sidebarOpen = true;
    } else if (isTablet) {
      this.sidebarOpen = false;
    }
  }
}
