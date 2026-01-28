# Team Management Dashboard - Manager Usage Guide

This guide explains how to use the Team Management Dashboard to monitor team performance, track metrics, and analyze productivity trends.

## Table of Contents

1. [Overview](#overview)
2. [Accessing the Dashboard](#accessing-the-dashboard)
3. [Dashboard Layout](#dashboard-layout)
4. [Selecting Teams and Collaborators](#selecting-teams-and-collaborators)
5. [Understanding Metrics](#understanding-metrics)
6. [Using the Goals Tab](#using-the-goals-tab)
7. [Using the Productivity Analysis Tab](#using-the-productivity-analysis-tab)
8. [Filtering by Time Period](#filtering-by-time-period)
9. [Refreshing Data](#refreshing-data)
10. [Mobile and Tablet Usage](#mobile-and-tablet-usage)
11. [Troubleshooting](#troubleshooting)

## Overview

The Team Management Dashboard is a specialized view designed for managers with the GESTAO role. It provides aggregate team performance metrics, historical trend analysis, and individual team member tracking.

### Key Features

- **Team Selection**: View data for different teams or departments
- **Collaborator Filtering**: Focus on individual team member performance
- **Month Navigation**: Review historical data month by month
- **Goals Tracking**: Monitor progress toward team goals
- **Productivity Analysis**: Visualize trends with interactive charts
- **Real-time Updates**: Refresh data to see the latest metrics

## Accessing the Dashboard

### Prerequisites

- You must have the **GESTAO** role assigned to your account
- You must be logged into the Game4U application

### Navigation

1. **From the Main Menu**:
   - Click on the navigation menu (☰ icon)
   - Select "Gestão de Equipe" or "Team Management"

2. **From the Dashboard Switcher**:
   - If you're on the personal dashboard, look for the dashboard switcher in the header
   - Click "Switch to Team Dashboard" or similar option

3. **Direct URL**:
   - Navigate to: `https://your-domain.com/team-management`

### Access Denied?

If you see an "Access Denied" message:
- Verify that you have the GESTAO role assigned
- Contact your system administrator to request access
- See [Role Configuration Guide](TEAM_DASHBOARD_ROLE_CONFIGURATION.md) for details

## Dashboard Layout

The dashboard is divided into three main areas:

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Team Selector | Collaborator Filter | Month Selector│
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│   Sidebar    │           Main Content Area                  │
│              │                                               │
│  - Points    │  Tabs:                                       │
│  - Metrics   │  • Metas e progresso (Goals)                │
│              │  • Análise de produtividade (Productivity)   │
│              │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

### Sidebar (Left)

Displays current month metrics:
- **Pontos da Temporada** (Season Points)
  - Total points
  - Blocked points (Bloqueados)
  - Unlocked points (Desbloqueados)
- **Progresso** (Progress)
  - Incomplete processes (Processos incompletos)
  - Completed activities (Atividades finalizadas)
  - Completed processes (Processos finalizados)

### Main Content Area (Right)

Contains two tabs:
1. **Metas e progresso**: Goal achievement metrics with circular progress indicators
2. **Análise de produtividade**: Historical trend charts and graphs

## Selecting Teams and Collaborators

### Team Selection

1. **Locate the Team Selector**:
   - Found in the top-left of the dashboard header
   - Shows the currently selected team name

2. **Change Team**:
   - Click on the team selector dropdown
   - Select a different team from the list
   - The dashboard will automatically reload with the new team's data

3. **Available Teams**:
   - You'll see all teams you have permission to manage
   - Teams are typically organized by department (e.g., "Departamento Pessoal", "Financeiro", "Comercial")

### Collaborator Filtering

1. **Locate the Collaborator Selector**:
   - Found next to the team selector in the header
   - Default shows "Todos" (All) or "All Collaborators"

2. **Filter by Individual**:
   - Click on the collaborator selector dropdown
   - Select a specific team member from the list
   - All metrics will update to show only that person's data

3. **View All Team Data**:
   - Select "Todos" (All) from the dropdown
   - This shows aggregate data for the entire team

### Selection Persistence

- Your last selected team is remembered across sessions
- When you return to the dashboard, it will load your previously selected team
- Collaborator filter resets to "All" when you change teams

## Understanding Metrics

### Season Points

Located in the sidebar, these metrics show point accumulation:

#### Total Points
- **What it means**: Sum of all points earned by the team (or selected collaborator) during the current season
- **Includes**: Both blocked and unlocked points
- **Use case**: Overall performance indicator

#### Blocked Points (Bloqueados)
- **What it means**: Points that are locked and cannot be spent yet
- **Typical reason**: Pending approval or waiting for process completion
- **Use case**: Track pending rewards

#### Unlocked Points (Desbloqueados)
- **What it means**: Points that are available to spend
- **Use case**: Track redeemable rewards

### Progress Metrics

Located in the sidebar, these metrics show workflow status:

#### Incomplete Processes (Processos incompletos)
- **What it means**: Number of processes started but not yet completed
- **Use case**: Identify bottlenecks or work in progress

#### Completed Activities (Atividades finalizadas)
- **What it means**: Number of individual activities finished
- **Use case**: Track day-to-day productivity

#### Completed Processes (Processos finalizados)
- **What it means**: Number of end-to-end processes completed
- **Use case**: Measure overall throughput and goal achievement

## Using the Goals Tab

The Goals tab (Metas e progresso) displays current goal achievement metrics.

### Viewing Goals

1. **Select the Goals Tab**:
   - Click on "Metas e progresso" at the top of the main content area
   - This is the default tab when you first load the dashboard

2. **Circular Progress Indicators**:
   - Each goal is displayed as a circular progress chart
   - The percentage shows how close you are to the target
   - Color coding indicates status:
     - **Green**: On track or completed (≥80%)
     - **Yellow**: Needs attention (50-79%)
     - **Red**: Behind target (<50%)

3. **Goal Details**:
   - **Label**: Name of the goal (e.g., "Processos Finalizados")
   - **Current Value**: Current achievement (e.g., 45)
   - **Target Value**: Goal target (e.g., 100)
   - **Percentage**: Completion percentage (e.g., 45%)

### Interpreting Goals

- **Processos Finalizados**: Target number of completed processes for the period
- **Atividades Finalizadas**: Target number of completed activities for the period
- Custom goals may be configured by your administrator

### Goal Period

- Goals are typically set for monthly periods
- Use the month selector to view historical goal achievement
- Current month shows real-time progress

## Using the Productivity Analysis Tab

The Productivity Analysis tab (Análise de produtividade) displays historical trend data in chart format.

### Viewing Productivity Trends

1. **Select the Productivity Tab**:
   - Click on "Análise de produtividade" at the top of the main content area

2. **Chart Display**:
   - Shows historical data as a line chart or bar chart
   - X-axis: Dates
   - Y-axis: Activity count or metric value

### Time Period Selection

1. **Locate the Period Selector**:
   - Found above the chart
   - Shows current selection (e.g., "Últimos 30 dias")

2. **Change Time Period**:
   - Click on the period selector dropdown
   - Choose from available options:
     - **7 dias**: Last 7 days (weekly view)
     - **15 dias**: Last 15 days (bi-weekly view)
     - **30 dias**: Last 30 days (monthly view)
     - **60 dias**: Last 60 days (bi-monthly view)
     - **90 dias**: Last 90 days (quarterly view)

3. **Chart Updates**:
   - The chart automatically updates when you change the period
   - A loading indicator appears while data is being fetched

### Chart Type Toggle

1. **Line Chart** (default):
   - Best for viewing trends over time
   - Shows continuous data flow
   - Easier to spot upward or downward trends

2. **Bar Chart**:
   - Best for comparing specific time periods
   - Shows discrete data points
   - Easier to compare individual days

3. **Toggle Between Types**:
   - Click the chart type toggle button above the chart
   - Icon changes between line (📈) and bar (📊) representations

### Interacting with Charts

1. **Hover for Details**:
   - Move your mouse over any data point
   - A tooltip appears showing:
     - Date
     - Exact value
     - Metric name

2. **Zoom and Pan** (if enabled):
   - Some charts support zooming into specific date ranges
   - Use mouse wheel or pinch gestures on touch devices

### Interpreting Trends

- **Upward Trend**: Increasing productivity or activity
- **Downward Trend**: Decreasing productivity (may need attention)
- **Flat Line**: Consistent performance
- **Spikes**: Unusual high activity (investigate cause)
- **Gaps**: Days with no data (weekends, holidays, or data issues)

## Filtering by Time Period

### Month Selector

1. **Locate the Month Selector**:
   - Found in the dashboard header
   - Shows current month in format "JAN/24" (Portuguese month abbreviation/year)

2. **Navigate Months**:
   - **Previous Month**: Click the left arrow (◀)
   - **Next Month**: Click the right arrow (▶)
   - **Current Month**: Click the month label to return to current month

3. **Data Updates**:
   - Sidebar metrics update to show the selected month's data
   - Goals tab shows goal achievement for that month
   - Productivity tab maintains its own period selection

### Date Range Behavior

- **Sidebar and Goals**: Use the selected month's date range
- **Productivity Tab**: Uses its own period selector (7, 15, 30, 60, or 90 days)
- **Season Points**: Always shows current season totals (not affected by month selector)

## Refreshing Data

### Manual Refresh

1. **Locate the Refresh Button**:
   - Found in the dashboard header (🔄 icon)
   - Shows last refresh time

2. **Click to Refresh**:
   - Click the refresh button
   - All data sections reload with fresh data from the server
   - Loading indicators appear during refresh

3. **Refresh Behavior**:
   - Clears cached data
   - Preserves your selections (team, collaborator, month, tab)
   - Updates last refresh timestamp

### Automatic Refresh

- The dashboard does not automatically refresh
- You must manually refresh to see the latest data
- Consider refreshing:
  - At the start of your review session
  - After making changes in other systems
  - When you notice stale data

### Refresh Frequency

- **Recommended**: Refresh every 5-10 minutes for active monitoring
- **Cache Duration**: Data is cached for 5 minutes to improve performance
- **Real-time**: For real-time data, refresh more frequently

## Mobile and Tablet Usage

The Team Management Dashboard is fully responsive and works on mobile and tablet devices.

### Mobile Layout (< 768px)

- **Sidebar**: Collapses to top of screen or hidden menu
- **Selectors**: Stack vertically for easier touch interaction
- **Charts**: Adjust to full width
- **Tabs**: Remain accessible with touch-friendly buttons

### Tablet Layout (768px - 1024px)

- **Sidebar**: May collapse or remain visible depending on orientation
- **Charts**: Optimized for medium screen size
- **Touch Gestures**: Supported for chart interaction

### Mobile Tips

1. **Rotate to Landscape**: Charts are easier to read in landscape mode
2. **Pinch to Zoom**: Use pinch gestures on charts for detail
3. **Swipe Navigation**: Swipe between tabs on some devices
4. **Dropdown Menus**: Tap to open, tap outside to close

## Troubleshooting

### Common Issues

#### "Access Denied" Message

**Problem**: You see an access denied error when trying to access the dashboard.

**Solution**:
1. Verify you have the GESTAO role assigned
2. Log out and log back in to refresh your session
3. Contact your administrator if the issue persists
4. See [Role Configuration Guide](TEAM_DASHBOARD_ROLE_CONFIGURATION.md)

#### No Teams Available

**Problem**: The team selector is empty or shows no teams.

**Solution**:
1. Verify teams are configured in your user metadata
2. Check with your administrator about team assignments
3. Ensure you have permission to view team data

#### No Data Displayed

**Problem**: Metrics show zero or "No data available".

**Solution**:
1. Check if the selected team has any activity in the selected period
2. Try selecting a different month or time period
3. Verify the team name matches exactly (case-sensitive)
4. Click the refresh button to reload data
5. Check browser console for errors (F12)

#### Charts Not Loading

**Problem**: Productivity charts show loading spinner indefinitely.

**Solution**:
1. Check your internet connection
2. Try refreshing the page (F5)
3. Clear browser cache and reload
4. Try a different browser
5. Check if Funifier API is accessible

#### Slow Performance

**Problem**: Dashboard is slow to load or update.

**Solution**:
1. Reduce the time period for productivity charts (use 7 or 15 days instead of 90)
2. Clear browser cache
3. Close other browser tabs
4. Check your internet connection speed
5. Contact administrator if issue persists (may be server-side)

#### Incorrect Data

**Problem**: Metrics don't match expected values.

**Solution**:
1. Verify you have the correct team selected
2. Check the month selector - ensure you're viewing the right period
3. Verify collaborator filter is set correctly (All vs. individual)
4. Refresh the data to clear cache
5. Compare with source data in Funifier if possible

### Getting Help

If you encounter issues not covered in this guide:

1. **Check the Troubleshooting Guide**: See [TEAM_DASHBOARD_TROUBLESHOOTING.md](TEAM_DASHBOARD_TROUBLESHOOTING.md)
2. **Contact Support**: Reach out to your system administrator
3. **Report Bugs**: Provide details about:
   - What you were trying to do
   - What happened instead
   - Browser and device information
   - Screenshots if possible

## Best Practices

### Daily Review

1. Start your day by reviewing the dashboard
2. Check for any red or yellow goal indicators
3. Look for downward trends in productivity charts
4. Identify team members who may need support

### Weekly Analysis

1. Review 7-day productivity trends
2. Compare current week to previous weeks
3. Identify patterns (e.g., lower productivity on certain days)
4. Celebrate achievements and improvements

### Monthly Planning

1. Review full month's data at month-end
2. Compare actual vs. goal achievement
3. Use insights for next month's planning
4. Share findings with your team

### Team Meetings

1. Use the dashboard during team meetings
2. Project the dashboard on a screen for visibility
3. Review metrics together with the team
4. Discuss trends and set improvement goals

## Keyboard Shortcuts

- **Tab**: Navigate between interactive elements
- **Enter**: Activate selected button or dropdown
- **Escape**: Close open dropdowns or modals
- **Arrow Keys**: Navigate within dropdowns
- **F5**: Refresh page
- **Ctrl/Cmd + R**: Refresh page

## Additional Resources

- [Role Configuration Guide](TEAM_DASHBOARD_ROLE_CONFIGURATION.md)
- [Troubleshooting Guide](TEAM_DASHBOARD_TROUBLESHOOTING.md)
- [API Integration Patterns](TEAM_DASHBOARD_API_INTEGRATION.md)
- [Aggregate Query Patterns](TEAM_DASHBOARD_AGGREGATE_QUERIES.md)

## Feedback

We're constantly improving the Team Management Dashboard. If you have suggestions or feedback:

- Contact your system administrator
- Submit feature requests through your organization's process
- Report bugs with detailed information

---

**Last Updated**: January 2024  
**Version**: 1.0  
**For**: Game4U Team Management Dashboard
