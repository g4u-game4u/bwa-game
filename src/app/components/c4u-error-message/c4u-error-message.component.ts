import { Component, Input, Output, EventEmitter } from '@angular/core';

/**
 * Error Message Component
 * 
 * Displays error messages with optional retry functionality.
 * Used throughout the team management dashboard to show
 * user-friendly error states when data loading fails.
 * 
 * Features:
 * - Customizable error message
 * - Optional retry button
 * - Icon-based visual feedback
 * - Accessible design
 * 
 * Requirements: 14.2, 14.3
 */
@Component({
  selector: 'c4u-error-message',
  templateUrl: './c4u-error-message.component.html',
  styleUrls: ['./c4u-error-message.component.scss']
})
export class C4uErrorMessageComponent {
  /**
   * Error message to display
   */
  @Input() message: string = 'Erro ao carregar dados';

  /**
   * Whether to show the retry button
   */
  @Input() showRetry: boolean = true;

  /**
   * Whether the retry operation is in progress
   */
  @Input() isRetrying: boolean = false;

  /**
   * Event emitted when retry button is clicked
   */
  @Output() retry = new EventEmitter<void>();

  /**
   * Handle retry button click
   */
  onRetry(): void {
    if (!this.isRetrying) {
      this.retry.emit();
    }
  }
}
