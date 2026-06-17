import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';

import { HelpCenterModule, HelpCenterSearchResult } from '@model/help-center.types';
import { HelpCenterService } from '@services/help-center.service';

@Component({
  selector: 'app-help-center-home',
  templateUrl: './help-center-home.component.html',
  styleUrls: ['./help-center-home.component.scss'],
})
export class HelpCenterHomeComponent implements OnInit, OnDestroy {
  modules: HelpCenterModule[] = [];
  searchResults: HelpCenterSearchResult[] = [];
  searchQuery = '';
  isLoading = true;
  isSearching = false;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private helpCenterService: HelpCenterService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.helpCenterService.getVisibleModules().subscribe(modules => {
      this.modules = modules;
      this.isLoading = false;
    });

    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(query => {
          this.isSearching = !!query.trim();
          return this.helpCenterService.search(query);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(results => {
        this.searchResults = results;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.search$.next(query);
  }

  navigateToModule(slug: string): void {
    this.router.navigate(['/dashboard/help', slug]);
  }

  trackBySlug(_index: number, module: HelpCenterModule): string {
    return module.slug;
  }

  trackByResult(_index: number, result: HelpCenterSearchResult): string {
    return result.module.slug;
  }
}
