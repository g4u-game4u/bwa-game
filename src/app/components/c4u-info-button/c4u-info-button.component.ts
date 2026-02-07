import { Component, Input, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { HelpTextsService } from '@services/help-texts.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'c4u-info-button',
  templateUrl: './c4u-info-button.component.html',
  styleUrls: ['./c4u-info-button.component.scss']
})
export class C4uInfoButtonComponent implements OnInit, OnDestroy {
  @Input() infoKey: string = '';
  @Input() customText: string = ''; // Optional custom text that overrides help-texts
  @Input() position: 'top' | 'bottom' | 'left' | 'right' = 'bottom'; // Changed default to 'bottom'
  @ViewChild('buttonWrapper', { static: false }) buttonWrapper?: ElementRef;
  
  helpText: string = '';
  showTooltip: boolean = false;
  computedPosition: 'top' | 'bottom' | 'left' | 'right' = 'bottom'; // Default: always show below
  tooltipStyle: { [key: string]: string } = {};
  private subscription?: Subscription;

  constructor(private helpTextsService: HelpTextsService) {}

  ngOnInit(): void {
    if (this.customText) {
      // Use custom text if provided
      this.helpText = this.customText;
    } else {
      // Load from help-texts service
      this.loadHelpText();
    }
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private loadHelpText(): void {
    this.subscription = this.helpTextsService.getHelpText(this.infoKey)
      .subscribe(text => {
        this.helpText = text;
      });
  }

  onMouseEnter(): void {
    this.calculatePosition();
    this.showTooltip = true;
  }

  onMouseLeave(): void {
    this.showTooltip = false;
  }

  onClick(event: Event): void {
    event.stopPropagation();
  }

  /**
   * Calculate the best position for the tooltip based on available space
   * Default behavior: always show below, only show above if there's not enough space below
   */
  private calculatePosition(): void {
    if (!this.buttonWrapper?.nativeElement) {
      // Default to bottom
      this.computedPosition = 'bottom';
      this.tooltipStyle = {};
      return;
    }

    const element = this.buttonWrapper.nativeElement;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // Default behavior: always try to show below
    // Only show above if there's not enough space below (less than 250px)
    const spaceBelow = viewportHeight - rect.bottom;
    const MIN_SPACE_BELOW = 250; // Minimum space needed below to show tooltip
    
    if (spaceBelow < MIN_SPACE_BELOW) {
      // Not enough space below, show above
      this.computedPosition = 'top';
      this.tooltipStyle = {};
    } else {
      // Enough space below, always show below (default behavior)
      this.computedPosition = 'bottom';
      this.tooltipStyle = {};
    }
  }

}

