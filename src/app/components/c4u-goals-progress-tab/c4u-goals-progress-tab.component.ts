import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';

/**
 * Goal metric model for displaying progress indicators
 */
export interface GoalMetric {
  id: string;
  label: string;
  current: number;
  target: number;
  unit?: string;
}

/**
 * Component for displaying goal achievement metrics with circular progress indicators.
 * 
 * This component displays current goal achievement metrics using circular progress
 * indicators. It reuses the KPICircularProgressComponent from the existing dashboard
 * to maintain visual consistency.
 * 
 * The component calculates completion percentages and displays them with appropriate
 * color coding based on completion status.
 * 
 * @example
 * <c4u-goals-progress-tab
 *   [goals]="goalMetrics">
 * </c4u-goals-progress-tab>
 */
@Component({
  selector: 'c4u-goals-progress-tab',
  templateUrl: './c4u-goals-progress-tab.component.html',
  styleUrls: ['./c4u-goals-progress-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uGoalsProgressTabComponent implements OnInit {
  /**
   * Array of goal metrics to display
   */
  @Input() goals: GoalMetric[] = [];

  /**
   * Loading state indicator
   */
  @Input() isLoading: boolean = false;

  ngOnInit(): void {
    // Component initialization
  }

  /**
   * Calculate completion percentage for a goal.
   * 
   * This method implements the progress metric calculation property:
   * For any goal with a target > 0, the percentage should be (current / target) * 100.
   * For goals with target = 0, the percentage should be 0.
   * 
   * @param goal - Goal metric object
   * @returns Completion percentage (0-100)
   */
  calculatePercentage(goal: GoalMetric): number {
    if (goal.target === 0) {
      return 0;
    }
    return Math.round((goal.current / goal.target) * 100);
  }

  /**
   * Get display text for goal values.
   * 
   * @param goal - Goal metric object
   * @returns Formatted string showing current/target
   */
  getGoalText(goal: GoalMetric): string {
    const unit = goal.unit || '';
    return `${goal.current}${unit} / ${goal.target}${unit}`;
  }

  /**
   * Track by function for ngFor optimization.
   * 
   * @param index - Array index
   * @param goal - Goal metric object
   * @returns Unique identifier for the goal
   */
  trackByGoalId(index: number, goal: GoalMetric): string {
    return goal.id;
  }
}
