import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-help-center-breadcrumb',
  templateUrl: './help-center-breadcrumb.component.html',
  styleUrls: ['./help-center-breadcrumb.component.scss'],
})
export class HelpCenterBreadcrumbComponent {
  @Input() moduleTitle: string | null = null;
}
