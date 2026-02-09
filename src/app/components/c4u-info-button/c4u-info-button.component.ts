import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { HelpTextsService } from '@services/help-texts.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'c4u-info-button',
  templateUrl: './c4u-info-button.component.html',
  styleUrls: ['./c4u-info-button.component.scss']
})
export class C4uInfoButtonComponent implements OnInit, OnDestroy, OnChanges {
  @Input() infoKey: string = '';
  @Input() customText: string = ''; // Optional custom text that overrides help-texts
  @Input() position: 'top' | 'bottom' | 'left' | 'right' = 'bottom'; // Changed default to 'bottom'
  @ViewChild('buttonWrapper', { static: false }) buttonWrapper?: ElementRef;
  @ViewChild('infoButton', { static: false }) infoButton?: ElementRef;
  
  helpText: string = '';
  showTooltip: boolean = false;
  computedPosition: 'top' | 'bottom' | 'left' | 'right' = 'bottom'; // Default: always show below
  tooltipStyle: { [key: string]: string } = {};
  private subscription?: Subscription;

  constructor(private helpTextsService: HelpTextsService) {}

  ngOnInit(): void {
    this.updateHelpText();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update help text when customText or infoKey changes
    if (changes['customText'] || changes['infoKey']) {
      this.updateHelpText();
    }
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  /**
   * Update help text based on customText or infoKey
   */
  private updateHelpText(): void {
    if (this.customText) {
      // If customText is provided, load default text and prepend customText
      this.subscription?.unsubscribe();
      this.subscription = this.helpTextsService.getHelpText(this.infoKey)
        .subscribe(text => {
          // Combine custom text (e.g., "100 de 10") with default help text
          this.helpText = `${this.customText}. ${text}`;
        });
    } else {
      // Load from help-texts service only
      this.loadHelpText();
    }
  }

  private loadHelpText(): void {
    this.subscription?.unsubscribe();
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
   * Uses fixed positioning to avoid being clipped by parent overflow
   */
  private calculatePosition(): void {
    // Prefer using the button element itself for more accurate positioning
    const targetElement = this.infoButton?.nativeElement || this.buttonWrapper?.nativeElement;
    
    if (!targetElement) {
      // Default to bottom
      this.computedPosition = this.position;
      this.tooltipStyle = {
        position: 'fixed'
      };
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const TOOLTIP_GAP = 4; // Reduced gap between button and tooltip for closer positioning
    const MIN_SPACE = 250; // Minimum space needed to show tooltip
    
    // Use fixed positioning to escape parent overflow constraints
    const baseStyle: { [key: string]: string } = {
      position: 'fixed',
      zIndex: '999999' // Higher than modals (9999) to ensure tooltip appears on top
    };
    
    // Determine position based on input position and available space
    if (this.position === 'top' || this.position === 'bottom') {
      // For top/bottom, check vertical space
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (this.position === 'bottom' && spaceBelow >= MIN_SPACE) {
        // Show below
        this.computedPosition = 'bottom';
        this.tooltipStyle = {
          ...baseStyle,
          top: `${rect.bottom + TOOLTIP_GAP}px`,
          left: `${rect.left + (rect.width / 2)}px`,
          transform: 'translateX(-50%)'
        };
      } else if (this.position === 'top' || spaceBelow < MIN_SPACE) {
        // Show above - position directly on top of the button
        this.computedPosition = 'top';
        // Position tooltip directly above the button center
        const buttonCenterX = rect.left + (rect.width / 2);
        // Position tooltip so the arrow (6px) touches the button
        // The transform translate(-50%, -100%) moves the tooltip up by its full height
        // So we position at rect.top, and the arrow (at bottom of tooltip) will be at rect.top
        // The arrow has margin-top: -1px, so it will slightly overlap the button
        this.tooltipStyle = {
          ...baseStyle,
          top: `${rect.top}px`, // Position at button top, arrow will touch button
          left: `${buttonCenterX}px`,
          transform: 'translate(-50%, -100%)'
        };
      } else {
        // Fallback to bottom
        this.computedPosition = 'bottom';
        this.tooltipStyle = {
          ...baseStyle,
          top: `${rect.bottom + TOOLTIP_GAP}px`,
          left: `${rect.left + (rect.width / 2)}px`,
          transform: 'translateX(-50%)'
        };
      }
    } else if (this.position === 'left' || this.position === 'right') {
      // For left/right, check horizontal space
      const spaceRight = viewportWidth - rect.right;
      const spaceLeft = rect.left;
      
      if (this.position === 'right' && spaceRight >= MIN_SPACE) {
        // Show to the right
        this.computedPosition = 'right';
        this.tooltipStyle = {
          ...baseStyle,
          left: `${rect.right + TOOLTIP_GAP}px`,
          top: `${rect.top + (rect.height / 2)}px`,
          transform: 'translateY(-50%)'
        };
      } else if (this.position === 'left' || spaceRight < MIN_SPACE) {
        // Show to the left
        this.computedPosition = 'left';
        this.tooltipStyle = {
          ...baseStyle,
          left: `${rect.left - TOOLTIP_GAP}px`,
          top: `${rect.top + (rect.height / 2)}px`,
          transform: 'translate(-100%, -50%)'
        };
      } else {
        // Fallback to right
        this.computedPosition = 'right';
        this.tooltipStyle = {
          ...baseStyle,
          left: `${rect.right + TOOLTIP_GAP}px`,
          top: `${rect.top + (rect.height / 2)}px`,
          transform: 'translateY(-50%)'
        };
      }
    } else {
      // Default to bottom
      this.computedPosition = 'bottom';
      this.tooltipStyle = {
        ...baseStyle,
        top: `${rect.bottom + TOOLTIP_GAP}px`,
        left: `${rect.left + (rect.width / 2)}px`,
        transform: 'translateX(-50%)'
      };
    }
  }

}

