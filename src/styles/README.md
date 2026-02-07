# Dark Theme Styling System

This directory contains the comprehensive dark theme styling system for the Gamification Dashboard, implementing the design specifications with wave background animations, accessibility features, and responsive design.

## File Structure

```
src/styles/
├── variables.scss    # Theme variables (colors, typography, spacing)
├── mixins.scss       # Reusable SCSS mixins
├── animations.scss   # Keyframe animations and wave effects
└── README.md         # This file
```

## Color Palette

### Primary Colors
- **Deep Blue**: `#1a237e` - Primary actions, headers
- **Electric Blue**: `#60a5fa` - Accents, progress bars
- **Success Green**: `#4caf50` - Completed states, positive metrics
- **Warning Orange**: `#ff9800` - Alerts, pending states
- **Error Red**: `#f44336` - Errors, critical alerts

### Dark Theme Colors
- **Background Primary**: `#0a0e27` - Main background
- **Background Secondary**: `#1a1f3a` - Card backgrounds
- **Surface**: `#252b4a` - Elevated surfaces
- **Text Primary**: `#ffffff` - Main text
- **Text Secondary**: `#b0bec5` - Secondary text
- **Border**: `#37474f` - Borders, dividers

## Typography

### Font Family
- Primary: `'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`

### Font Weights
- Light: 300
- Regular: 400
- Medium: 500
- Semi-bold: 600
- Bold: 700

### Font Sizes
- H1: 2.5rem (40px)
- H2: 2rem (32px)
- H3: 1.5rem (24px)
- Body: 1rem (16px)
- Small: 0.875rem (14px)
- Caption: 0.75rem (12px)

## Spacing Scale

Based on 4px unit:
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- xxl: 48px

## Mixins

### Card Mixin
```scss
@include card;
```
Creates a card with surface background, border radius, shadow, and hover effects.

### Button Mixins
```scss
@include button-primary;  // Gradient primary button
@include button-secondary; // Outlined secondary button
```

### Progress Indicators
```scss
@include progress-circular($size, $stroke-width);
@include progress-linear($height);
```

### Text Mixins
```scss
@include text-heading-1;
@include text-heading-2;
@include text-heading-3;
@include text-body;
@include text-secondary;
```

### Responsive Mixins
```scss
@include mobile-only { /* styles */ }
@include tablet-up { /* styles */ }
@include desktop-up { /* styles */ }
```

### Accessibility Mixins
```scss
@include focus-visible;  // Adds focus outline
@include reduced-motion { /* alternative styles */ }
```

## Animations

### Keyframe Animations
- `fadeIn` - Fade in from opacity 0 to 1
- `slideUp` - Slide up with fade in
- `scaleIn` - Scale from 0.9 to 1 with fade
- `shimmer` - Loading shimmer effect
- `wave1`, `wave2`, `wave3` - Wave background animations
- `pulse` - Pulsing animation for in-progress states

### Animation Classes
```scss
.fade-in    // Apply fade in animation
.slide-up   // Apply slide up animation
.scale-in   // Apply scale in animation
.hover-lift // Lift on hover
.hover-scale // Scale on hover
.hover-glow  // Glow effect on hover
```

## Wave Background

The wave background is automatically applied to the body element and creates a subtle animated gradient effect using three overlapping wave layers with different animation speeds.

### Wave Configuration
- Color: `rgba(63, 81, 181, 0.05)`
- Animation Duration: 20s (varies per layer)
- Layers: 3 overlapping gradients

## Accessibility Features

### Focus States
- 2px solid outline in electric blue
- 2px offset for visibility
- Applied to all interactive elements

### Touch Targets
- Minimum 44px height/width for all interactive elements

### Color Contrast
- Meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)

### Reduced Motion
- Respects `prefers-reduced-motion` media query
- Disables animations for users who prefer reduced motion

## Responsive Breakpoints

- **Mobile**: 320px - 767px
- **Tablet**: 768px - 1023px
- **Desktop**: 1024px+

## Usage Examples

### Creating a Card Component
```scss
@import '../../../styles/variables.scss';
@import '../../../styles/mixins.scss';

.my-card {
  @include card;
  
  .card-title {
    @include text-heading-3;
  }
  
  .card-content {
    @include text-body;
  }
}
```

### Adding Responsive Styles
```scss
.my-component {
  padding: $spacing-lg;
  
  @include mobile-only {
    padding: $spacing-md;
  }
  
  @include desktop-up {
    padding: $spacing-xl;
  }
}
```

### Creating Accessible Buttons
```scss
.my-button {
  @include button-primary;
  @include focus-visible;
  
  @include reduced-motion {
    transition: none;
  }
}
```

## Best Practices

1. **Always import variables and mixins** at the top of component SCSS files
2. **Use spacing variables** instead of hardcoded pixel values
3. **Apply focus-visible mixin** to all interactive elements
4. **Include reduced-motion alternatives** for animations
5. **Use semantic color variables** (e.g., `$success-green` instead of hex codes)
6. **Test at all breakpoints** using responsive mixins
7. **Maintain minimum touch targets** of 44px for mobile
8. **Use text mixins** for consistent typography

## Performance Considerations

- Animations use `transform` and `opacity` for GPU acceleration
- Wave background is fixed position to avoid repaints
- Transitions are optimized with cubic-bezier easing
- Reduced motion support prevents unnecessary animations

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Grid and Flexbox required
- CSS Custom Properties supported
- Backdrop filter for modal overlays

## Future Enhancements

- Light theme variant
- Additional color schemes
- More animation presets
- Extended component library
- Theme customization API
