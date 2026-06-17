import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';

import { HelpCenterModule } from '@model/help-center.types';
import { HelpCenterService } from '@services/help-center.service';

@Component({
  selector: 'app-help-center-module-page',
  templateUrl: './help-center-module-page.component.html',
  styleUrls: ['./help-center-module-page.component.scss'],
})
export class HelpCenterModulePageComponent implements OnInit, OnDestroy {
  module: HelpCenterModule | null = null;
  relatedModules: HelpCenterModule[] = [];
  expandedIndex: number | null = 0;
  isLoading = true;
  notFound = false;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private helpCenterService: HelpCenterService
  ) {}

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap(params => {
          const slug = params.get('moduleSlug') ?? '';
          this.isLoading = true;
          this.notFound = false;
          return this.helpCenterService.getModuleBySlug(slug);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(module => {
        this.isLoading = false;
        if (!module) {
          this.notFound = true;
          this.module = null;
          return;
        }
        this.module = module;
        this.loadRelatedModules(module);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleFaq(index: number): void {
    this.expandedIndex = this.expandedIndex === index ? null : index;
  }

  isExpanded(index: number): boolean {
    return this.expandedIndex === index;
  }

  navigateToModule(slug: string): void {
    this.router.navigate(['/dashboard/help', slug]);
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackBySlug(_index: number, item: HelpCenterModule): string {
    return item.slug;
  }

  private loadRelatedModules(module: HelpCenterModule): void {
    if (!module.relatedSlugs?.length) {
      this.relatedModules = [];
      return;
    }

    this.helpCenterService.getVisibleModules().subscribe(modules => {
      this.relatedModules = module.relatedSlugs!
        .map(slug => modules.find(m => m.slug === slug))
        .filter((m): m is HelpCenterModule => !!m);
    });
  }
}
