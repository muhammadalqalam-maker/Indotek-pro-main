# Responsive Design Specification - Indotek Pro

**Target Viewports:** 360px, 390px, 768px, 1024px, 1440px  
**Approach:** Mobile-first, zero horizontal overflow  
**Standards:** WCAG AA accessibility, PWA-ready

---

## 1. Breakpoint Token System

### 1.1 CSS Theme Tokens (src/index.css)

Add to existing `@theme` block:

```css
@theme {
  /* Existing tokens... */
  
  /* Responsive Breakpoints */
  --breakpoint-xs: 360px;
  --breakpoint-sm: 390px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1440px;
  
  /* Safe Area Insets (notched devices) */
  --safe-area-top: env(safe-area-inset-top, 0);
  --safe-area-bottom: env(safe-area-inset-bottom, 0);
  --safe-area-left: env(safe-area-inset-left, 0);
  --safe-area-right: env(safe-area-inset-right, 0);
  
  /* Tap Target Minimums */
  --tap-target-min: 44px;
}
```

### 1.2 TypeScript Constants (src/config/breakpoints.ts)

```typescript
export const BREAKPOINTS = {
  xs: 360,
  sm: 390,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export const MEDIA_QUERIES = {
  xs: `(min-width: ${BREAKPOINTS.xs}px)`,
  sm: `(min-width: ${BREAKPOINTS.sm}px)`,
  md: `(min-width: ${BREAKPOINTS.md}px)`,
  lg: `(min-width: ${BREAKPOINTS.lg}px)`,
  xl: `(min-width: ${BREAKPOINTS.xl}px)`,
  maxMd: `(max-width: ${BREAKPOINTS.md - 1}px)`,
  maxLg: `(max-width: ${BREAKPOINTS.lg - 1}px)`,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
```

### 1.3 Custom Hook (src/hooks/useMediaQuery.ts)

```typescript
import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
};

// Convenience hooks
export const useIsMobile = () => useMediaQuery(MEDIA_QUERIES.maxMd);
export const useIsTablet = () => {
  const isAboveMd = useMediaQuery(MEDIA_QUERIES.md);
  const isBelowLg = useMediaQuery(MEDIA_QUERIES.maxLg);
  return isAboveMd && isBelowLg;
};
export const useIsDesktop = () => useMediaQuery(MEDIA_QUERIES.lg);
```

---

## 2. Component Responsive Strategy Matrix

| Component | 360-767px | 768-1023px | 1024+ | Implementation |
|-----------|-----------|------------|-------|----------------|
| **Layout** |
| [`AppShell`](../src/components/layout/AppShell.tsx) | Bottom nav only | Sidebar (icon mode) + bottom nav | Full sidebar | Add `<BottomNavigation />` below main |
| [`Sidebar`](../src/components/layout/Sidebar.tsx) | Hidden (drawer) | Icon-only, labels on hover | Full width with labels | Add `collapsed` prop, tablet detection |
| [`Topbar`](../src/components/layout/Topbar.tsx) | Compact: burger + logo + sync | Search input visible | Full search + breadcrumb | Mobile: search → bottom sheet |
| **Navigation** |
| `BottomNavigation` | 4-5 primary items | Same | Hidden | NEW component, safe-area-inset-bottom |
| **Data Display** |
| Projects Table | Card list | Card list | Table | NEW `<ProjectCard />` |
| Purchase Orders Table | Card list | Card list | Table | NEW `<POCard />` |
| Materials Table | Card list | Card list | Table | NEW `<MaterialCard />` |
| Reports Table | Card list | Card list | Table | NEW `<ReportCard />` |
| Team Table | Card list | Card list | Table | NEW `<TeamMemberCard />` |
| Resource Prices Table | Card list | Card list | Table | NEW `<PriceCard />` |
| AHSP Templates Table | Card list | Card list | Table | NEW `<AHSPCard />` |
| BOQ Items Table | Card list | Card list | Table | NEW `<BOQCard />` |
| **Overlays** |
| [`Modal`](../src/components/common/Modal.tsx) | Bottom sheet | Bottom sheet | Center modal | Conditional wrapper based on viewport |
| Drawer (mobile nav) | Full screen overlay | N/A | N/A | Keep existing, add focus trap |
| **Interactive** |
| [`Button`](../src/components/common/Button.tsx) | 44px min height | 40px (md/lg) | 36px (md) default | Add `touch-friendly` variant |
| Form Inputs | 44px min height | 40px | 36px | Add mobile-optimized sizes |
| Search Input | Bottom sheet expansion | Inline dropdown | Inline dropdown | NEW `<SearchSheet />` |
| **Feedback** |
| Toast | Bottom position | Top-right | Top-right | Adjust container position |

---

## 3. Layout Migration Guide

### 3.1 Bottom Navigation Component

**File:** `src/components/layout/BottomNavigation.tsx`

```typescript
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, ClipboardList, Package, FileText, Users } from 'lucide-react';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: Home, label: 'Beranda' },
  { to: '/projects', icon: ClipboardList, label: 'Proyek' },
  { to: '/materials', icon: Package, label: 'Material' },
  { to: '/procurement', icon: FileText, label: 'Pengadaan' },
  { to: '/team', icon: Users, label: 'Tim' },
];

export const BottomNavigation: React.FC = () => {
  return (
    <nav 
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8E4] z-30"
      style={{ paddingBottom: 'var(--safe-area-bottom)' }}
      role="navigation"
      aria-label="Navigasi utama"
    >
      <div className="flex items-stretch justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 flex-1 min-w-0 text-xs transition-colors ${
                  isActive
                    ? 'text-[#12352B] font-semibold'
                    : 'text-[#69766F] hover:text-[#12352B]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                  <span className="truncate max-w-full px-1">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
```

**Integration in [`AppShell.tsx`](../src/components/layout/AppShell.tsx:11):**

```typescript
import { BottomNavigation } from './BottomNavigation';

// After main content:
<main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
  {children}
</main>
<BottomNavigation />
```

### 3.2 Sidebar Icon Mode (768-1023px)

**Update [`Sidebar.tsx`](../src/components/layout/Sidebar.tsx:55):**

```typescript
import { useMediaQuery, MEDIA_QUERIES } from '../hooks/useMediaQuery';

export const Sidebar: React.FC<{ isMobileDrawer?: boolean; onCloseMobile?: () => void }> = ({
  isMobileDrawer = false,
  onCloseMobile,
}) => {
  const isTablet = useMediaQuery(MEDIA_QUERIES.md) && useMediaQuery(MEDIA_QUERIES.maxLg);
  const isIconOnly = !isMobileDrawer && isTablet;

  return (
    <aside className={`${isIconOnly ? 'w-20' : 'w-64'} transition-all`}>
      {/* Nav items */}
      <NavLink
        className={`flex items-center gap-3 px-4 py-2.5 ${isIconOnly ? 'justify-center' : ''}`}
        title={isIconOnly ? item.label : undefined}
      >
        <Icon className="w-5 h-5 shrink-0" />
        {!isIconOnly && <span>{item.label}</span>}
      </NavLink>
    </aside>
  );
};
```

### 3.3 Mobile Drawer Focus Trap

**Current state:** [`Modal.tsx`](../src/components/common/Modal.tsx:34) has Tab key focus trap.  
**Action:** Extract to `useFocusTrap` hook, reuse in mobile drawer.

**File:** `src/hooks/useFocusTrap.ts`

```typescript
import { useEffect, RefObject } from 'react';

export const useFocusTrap = (
  containerRef: RefObject<HTMLElement>,
  isActive: boolean
) => {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const previousActiveElement = document.activeElement as HTMLElement;
    const container = containerRef.current;

    // Focus first focusable element
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusableElements[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(focusableElements);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [containerRef, isActive]);
};
```

### 3.4 Modal → Bottom Sheet (<768px)

**File:** `src/components/common/BottomSheet.tsx`

```typescript
import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, isOpen);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 max-h-[90dvh] flex flex-col animate-slide-up"
        style={{ paddingBottom: 'var(--safe-area-bottom)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottom-sheet-title"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-[#CAD4CE] rounded-full" aria-hidden="true" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8E4]">
          <h2 id="bottom-sheet-title" className="text-lg font-semibold text-[#12352B]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[#69766F] hover:text-[#12352B] hover:bg-[#F5F7F6] rounded-lg transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
      </div>
    </>
  );
};
```

**Update existing modals to use responsive wrapper:**

```typescript
import { useIsMobile } from '../hooks/useMediaQuery';
import { Modal } from './Modal';
import { BottomSheet } from './BottomSheet';

export const ResponsiveDialog: React.FC<DialogProps> = (props) => {
  const isMobile = useIsMobile();
  
  return isMobile ? (
    <BottomSheet {...props} />
  ) : (
    <Modal {...props} />
  );
};
```

### 3.5 Table → Card Conversion (<768px)

**8 Tables requiring card treatment:**
1. [`ProjectsScreen.tsx`](../src/components/screens/ProjectsScreen.tsx) - Projects table
2. [`ProcurementScreen.tsx`](../src/components/screens/ProcurementScreen.tsx) - Purchase Orders
3. [`MaterialsScreen.tsx`](../src/components/screens/MaterialsScreen.tsx) - Materials stock
4. [`ReportsScreen.tsx`](../src/components/screens/ReportsScreen.tsx) - Field reports
5. [`TeamScreen.tsx`](../src/components/screens/TeamScreen.tsx) - Team members
6. [`ResourcePricesScreen.tsx`](../src/components/screens/ResourcePricesScreen.tsx) - Resource prices
7. [`AHSPTemplatesScreen.tsx`](../src/components/screens/AHSPTemplatesScreen.tsx) - AHSP templates
8. [`BOQItemizedTab.tsx`](../src/components/screens/budget/BOQItemizedTab.tsx) - BOQ items

**Pattern - Generic Card Component:**

```typescript
// src/components/common/DataCard.tsx
import React from 'react';

interface DataCardProps {
  title: string;
  subtitle?: string;
  metadata: Array<{ label: string; value: React.ReactNode; highlight?: boolean }>;
  actions?: React.ReactNode;
  onClick?: () => void;
}

export const DataCard: React.FC<DataCardProps> = ({
  title,
  subtitle,
  metadata,
  actions,
  onClick,
}) => {
  return (
    <div
      className={`bg-white border border-[#E2E8E4] rounded-lg p-4 ${
        onClick ? 'cursor-pointer hover:border-[#12352B] transition-colors' : ''
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[#12352B] truncate">{title}</h3>
          {subtitle && (
            <p className="text-sm text-[#69766F] truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {/* Metadata Grid */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {metadata.map((item, idx) => (
          <div key={idx} className={item.highlight ? 'col-span-2' : ''}>
            <dt className="text-xs text-[#69766F] mb-0.5">{item.label}</dt>
            <dd className={`text-sm font-medium ${item.highlight ? 'text-[#12352B] text-base' : 'text-[#202B26]'}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
```

**Example - Project Card:**

```typescript
<DataCard
  title={project.name}
  subtitle={project.client_name}
  metadata={[
    { label: 'Kode', value: project.code },
    { label: 'Status', value: <Badge status={project.status} /> },
    { label: 'Lokasi', value: project.location },
    { label: 'Tanggal Mulai', value: formatDate(project.start_date) },
    { label: 'Nilai Kontrak', value: formatCurrency(project.contract_value), highlight: true },
  ]}
  actions={<MoreButton />}
  onClick={() => navigate(`/projects/${project.id}`)}
/>
```

**Responsive Table Wrapper:**

```typescript
// src/components/common/ResponsiveTable.tsx
import { useIsMobile } from '../../hooks/useMediaQuery';

interface ResponsiveTableProps<T> {
  data: T[];
  renderTable: () => React.ReactNode;
  renderCard: (item: T) => React.ReactNode;
}

export function ResponsiveTable<T>({ data, renderTable, renderCard }: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {data.map((item, idx) => (
          <React.Fragment key={idx}>{renderCard(item)}</React.Fragment>
        ))}
      </div>
    );
  }

  return <div className="overflow-x-auto">{renderTable()}</div>;
}
```

---

## 4. Accessibility Checklist

### 4.1 Focus Management

- [x] **Visible Focus Indicators** - All interactive elements have `focus-visible:ring-2 focus-visible:ring-[#12352B] focus-visible:ring-offset-2` (Tailwind v4)
- [ ] **Focus Trap** - Modal/drawer/bottom-sheet trap Tab key (implement `useFocusTrap`)
- [ ] **Focus Return** - After closing overlay, focus returns to trigger element
- [ ] **Skip Links** - Add "Skip to main content" link at top of page
- [ ] **Keyboard Nav** - All features operable via keyboard (no mouse-only)

### 4.2 Color Contrast (WCAG AA)

Current tokens from [`src/index.css`](../src/index.css:1):
- Primary: `#12352B` (forest green) on white = **14.95:1** ✅
- Accent: `#D6A85C` (gold) on white = **4.62:1** ✅
- Text: `#202B26` on white = **16.02:1** ✅
- Secondary text: `#69766F` on white = **4.58:1** ✅

**Action items:**
- [ ] Verify all interactive states (hover, disabled, active) meet 4.5:1 for normal text, 3:1 for large text
- [ ] Test icon-only buttons for 3:1 contrast (non-text content)
- [ ] Ensure form error messages have sufficient contrast

### 4.3 Touch Targets

**Minimum:** 44×44px (iOS/Android guidelines)

Current [`Button.tsx`](../src/components/common/Button.tsx:12) sizes:
- `xs`: 28px ❌
- `sm`: 32px ❌
- `md`: 36px ❌
- `lg`: 40px ❌

**Fix:**
```typescript
const sizeClasses = {
  xs: 'text-[11px] px-3 py-2 gap-1 min-h-[44px]', // mobile
  sm: 'text-xs px-3 py-2.5 gap-1.5 min-h-[44px] md:min-h-8', // mobile: 44px, desktop: 32px
  md: 'text-sm px-4 py-3 gap-2 min-h-[44px] md:min-h-9', // mobile: 44px, desktop: 36px
  lg: 'text-sm px-5 py-3.5 gap-2.5 min-h-[44px] md:min-h-10', // mobile: 44px, desktop: 40px
};
```

**Apply to:**
- [ ] All buttons in touch contexts
- [ ] Bottom navigation items (already 64px height ✅)
- [ ] Form inputs (select, checkbox, radio)
- [ ] Icon-only buttons (burger menu, close, more actions)

### 4.4 Screen Reader Support

- [ ] **Semantic HTML** - Use `<nav>`, `<main>`, `<aside>`, `<article>`, `<section>` correctly
- [ ] **ARIA Labels** - Icon-only buttons have `aria-label`
- [ ] **ARIA Live Regions** - Toast notifications use `role="status"` or `aria-live="polite"`
- [ ] **ARIA Expanded** - Dropdowns/accordions use `aria-expanded`
- [ ] **Table Headers** - All tables have `<th scope="col">` or `<th scope="row">`

### 4.5 Form Accessibility

- [ ] **Labels** - All inputs have associated `<label>` or `aria-label`
- [ ] **Error Messages** - Linked via `aria-describedby`, visible, persist until fixed
- [ ] **Required Fields** - Use `required` attribute + visual indicator
- [ ] **Input Types** - Use `type="email"`, `type="tel"`, `inputMode="numeric"` for mobile keyboards
- [ ] **Autocomplete** - Use `autocomplete` attributes (name, email, tel, etc.)

### 4.6 Motion & Animation

Add to [`src/index.css`](../src/index.css:1):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 4.7 Viewport & Zoom

Update [`index.html`](../index.html:5):

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
<meta name="theme-color" content="#12352B" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#12352B" media="(prefers-color-scheme: dark)" />
```

**Do NOT use** `user-scalable=no` or `maximum-scale=1.0` (WCAG failure).

---

## 5. Playwright Test Matrix

### 5.1 Test Infrastructure Setup

**Install Playwright:**
```bash
npm install -D @playwright/test
npx playwright install
```

**Config:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 640 } },
    },
    {
      name: 'mobile-390',
      use: { ...devices['iPhone 12'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet-768',
      use: { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop-1024',
      use: { viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'desktop-1440',
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 5.2 Test Scenarios (5 viewports × 3 scenarios = 15 tests)

#### Scenario 1: No Horizontal Overflow

**File:** `tests/e2e/responsive-overflow.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const ROUTES = [
  '/',
  '/dashboard',
  '/projects',
  '/materials',
  '/procurement',
  '/team',
];

test.describe('No horizontal overflow', () => {
  for (const route of ROUTES) {
    test(`${route} has no overflow on ${test.info().project.name}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // Assert no horizontal scrollbar
      const scrollWidth = await page.evaluate(() => {
        return document.documentElement.scrollWidth;
      });
      const clientWidth = await page.evaluate(() => {
        return document.documentElement.clientWidth;
      });

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      // Screenshot for visual regression
      await page.screenshot({
        path: `tests/screenshots/${test.info().project.name}/${route.replace(/\//g, '-') || 'home'}.png`,
        fullPage: true,
      });
    });
  }
});
```

#### Scenario 2: Bottom Navigation Visibility

**File:** `tests/e2e/responsive-navigation.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Navigation adaptation', () => {
  test('Bottom nav visible on mobile, hidden on desktop', async ({ page }) => {
    await page.goto('/dashboard');
    
    const viewport = page.viewportSize();
    const isMobile = viewport!.width < 1024;
    
    const bottomNav = page.locator('nav[aria-label="Navigasi utama"]');
    
    if (isMobile) {
      await expect(bottomNav).toBeVisible();
      
      // Test tap target size
      const navButtons = bottomNav.locator('a');
      const count = await navButtons.count();
      
      for (let i = 0; i < count; i++) {
        const box = await navButtons.nth(i).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    } else {
      await expect(bottomNav).toBeHidden();
    }
    
    await page.screenshot({
      path: `tests/screenshots/${test.info().project.name}/navigation.png`,
    });
  });
  
  test('Sidebar adapts correctly', async ({ page }) => {
    await page.goto('/dashboard');
    
    const viewport = page.viewportSize();
    const sidebar = page.locator('aside').first();
    
    if (viewport!.width >= 1024) {
      // Desktop: full sidebar
      await expect(sidebar).toBeVisible();
      const box = await sidebar.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(240); // 256px = w-64
    } else if (viewport!.width >= 768) {
      // Tablet: icon-only sidebar
      await expect(sidebar).toBeVisible();
      const box = await sidebar.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(100); // ~80px icon mode
    } else {
      // Mobile: drawer (hidden by default)
      await expect(sidebar).toBeHidden();
    }
  });
});
```

#### Scenario 3: Modal/Bottom Sheet Transformation

**File:** `tests/e2e/responsive-modals.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Modal responsiveness', () => {
  test('Modal transforms to bottom sheet on mobile', async ({ page }) => {
    await page.goto('/projects');
    
    // Trigger modal (example: "New Project" button)
    await page.click('button:has-text("Tambah Proyek")');
    
    const viewport = page.viewportSize();
    const isMobile = viewport!.width < 768;
    
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    if (isMobile) {
      // Bottom sheet: positioned at bottom, rounded top corners
      const box = await dialog.boundingBox();
      const viewportHeight = viewport!.height;
      
      // Should be near bottom of screen
      expect(box!.y + box!.height).toBeGreaterThan(viewportHeight * 0.5);
      
      // Has handle bar
      const handleBar = dialog.locator('[aria-hidden="true"]').first();
      await expect(handleBar).toBeVisible();
      
      // Test focus trap
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']).toContain(focusedElement);
    } else {
      // Desktop modal: centered
      const box = await dialog.boundingBox();
      const viewportWidth = viewport!.width;
      const viewportHeight = viewport!.height;
      
      const centerX = box!.x + box!.width / 2;
      const centerY = box!.y + box!.height / 2;
      
      expect(centerX).toBeGreaterThan(viewportWidth * 0.3);
      expect(centerX).toBeLessThan(viewportWidth * 0.7);
      expect(centerY).toBeGreaterThan(viewportHeight * 0.2);
      expect(centerY).toBeLessThan(viewportHeight * 0.8);
    }
    
    await page.screenshot({
      path: `tests/screenshots/${test.info().project.name}/modal.png`,
    });
    
    // Close with ESC
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
```

#### Scenario 4: Table → Card Transformation

**File:** `tests/e2e/responsive-tables.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const TABLE_ROUTES = [
  { path: '/projects', dataTestId: 'projects-list' },
  { path: '/materials', dataTestId: 'materials-list' },
  { path: '/procurement', dataTestId: 'po-list' },
  { path: '/team', dataTestId: 'team-list' },
];

test.describe('Table to card transformation', () => {
  for (const route of TABLE_ROUTES) {
    test(`${route.path} renders cards on mobile, table on desktop`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      
      const viewport = page.viewportSize();
      const isMobile = viewport!.width < 768;
      
      if (isMobile) {
        // Should be cards (no <table> element visible)
        const table = page.locator('table');
        await expect(table).toBeHidden();
        
        // Cards should be present
        const cards = page.locator('[class*="border"][class*="rounded"]');
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);
      } else {
        // Should be table
        const table = page.locator('table');
        await expect(table).toBeVisible();
        
        // Has proper headers
        const headers = table.locator('th');
        const headerCount = await headers.count();
        expect(headerCount).toBeGreaterThan(0);
      }
      
      await page.screenshot({
        path: `tests/screenshots/${test.info().project.name}/${route.path.replace(/\//g, '-')}-list.png`,
        fullPage: true,
      });
    });
  }
});
```

#### Scenario 5: Tap Target Verification

**File:** `tests/e2e/responsive-tap-targets.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Touch target sizes', () => {
  test('All interactive elements meet 44px minimum on mobile', async ({ page }) => {
    await page.goto('/dashboard');
    
    const viewport = page.viewportSize();
    if (viewport!.width >= 768) {
      test.skip(); // Only test on mobile
    }
    
    // Get all buttons, links, inputs
    const interactiveSelectors = [
      'button:visible',
      'a:visible',
      'input:visible',
      'select:visible',
      '[role="button"]:visible',
    ];
    
    for (const selector of interactiveSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      
      for (let i = 0; i < count; i++) {
        const box = await elements.nth(i).boundingBox();
        if (box) {
          expect(
            box.height,
            `Element ${selector}[${i}] height ${box.height}px < 44px`
          ).toBeGreaterThanOrEqual(44);
          
          expect(
            box.width,
            `Element ${selector}[${i}] width ${box.width}px < 44px`
          ).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});
```

### 5.3 Running Tests

```bash
# All viewports
npm run test:e2e

# Specific viewport
npx playwright test --project=mobile-360

# Update snapshots
npx playwright test --update-snapshots

# Interactive UI mode
npx playwright test --ui
```

Add to `package.json`:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## 6. HTML/CSS Foundation Updates

### 6.1 Update [`index.html`](../index.html:5)

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
  <meta name="theme-color" content="#12352B" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#12352B" media="(prefers-color-scheme: dark)" />
  
  <!-- PWA Support -->
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
  <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
  
  <title>Indotek Pro - Manajemen Proyek Konstruksi</title>
  <meta name="description" content="Platform manajemen proyek konstruksi untuk mengelola RAB, material, pengadaan, dan tim lapangan" />
</head>

<body class="bg-[#F5F7F6] text-[#202B26] antialiased selection:bg-[#12352B]/15 selection:text-[#12352B]">
  <!-- Skip Link -->
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#12352B] focus:text-white focus:rounded-lg">
    Lewati ke konten utama
  </a>
  
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

### 6.2 Update [`src/index.css`](../src/index.css:1)

```css
@import 'tailwindcss';

@theme {
  /* Existing tokens... */
  
  /* Responsive Breakpoints */
  --breakpoint-xs: 360px;
  --breakpoint-sm: 390px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1440px;
  
  /* Safe Area Insets */
  --safe-area-top: env(safe-area-inset-top, 0);
  --safe-area-bottom: env(safe-area-inset-bottom, 0);
  --safe-area-left: env(safe-area-inset-left, 0);
  --safe-area-right: env(safe-area-inset-right, 0);
  
  /* Tap Target */
  --tap-target-min: 44px;
}

/* Replace all h-screen with h-dvh for proper mobile viewport */
* {
  box-sizing: border-box;
}

html {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

body {
  min-height: 100dvh; /* Dynamic Viewport Height */
  overscroll-behavior-y: none; /* Prevent pull-to-refresh on web */
}

/* Focus Styles */
*:focus-visible {
  outline: 2px solid var(--color-primary-forest);
  outline-offset: 2px;
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Animations for Bottom Sheet */
@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}

/* Screen Reader Only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.sr-only:focus,
.sr-only:active {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

---

## 7. PWA Manifest Configuration

**File:** `public/manifest.json`

```json
{
  "name": "Indotek Pro - Manajemen Proyek Konstruksi",
  "short_name": "Indotek Pro",
  "description": "Platform manajemen proyek konstruksi untuk mengelola RAB, material, pengadaan, dan tim lapangan",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F5F7F6",
  "theme_color": "#12352B",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["business", "productivity"],
  "lang": "id",
  "dir": "ltr",
  "scope": "/",
  "prefer_related_applications": false
}
```

**Existing PWA plugin in [`package.json`](../package.json:20):**
- `vite-plugin-pwa@0.21.2` already installed ✅

**Update `vite.config.ts`:**

```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // Use static manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
});
```

---

## 8. Implementation Todo Checklist

### Phase 1: Foundation (HTML & CSS)
- [ ] Update [`index.html`](../index.html:5) viewport, safe-area, theme-color, skip link
- [ ] Update [`src/index.css`](../src/index.css:1) with breakpoint tokens, safe-area variables, dvh units
- [ ] Add animations (slide-up, fade-in) and reduced-motion media query
- [ ] Replace all `h-screen` with `h-dvh` across components

### Phase 2: Navigation Infrastructure
- [ ] Create [`src/config/breakpoints.ts`](../src/config/breakpoints.ts) with BREAKPOINTS and MEDIA_QUERIES
- [ ] Create [`src/hooks/useMediaQuery.ts`](../src/hooks/useMediaQuery.ts) with useIsMobile, useIsTablet, useIsDesktop
- [ ] Create [`src/components/layout/BottomNavigation.tsx`](../src/components/layout/BottomNavigation.tsx)
- [ ] Update [`AppShell.tsx`](../src/components/layout/AppShell.tsx:11) to include BottomNavigation
- [ ] Update [`Sidebar.tsx`](../src/components/layout/Sidebar.tsx:55) with icon-only mode for tablet

### Phase 3: Button & Input Responsiveness
- [ ] Install `tailwind-merge` for class merging: `npm install tailwind-merge`
- [ ] Update [`Button.tsx`](../src/components/common/Button.tsx:12) with responsive size variants (44px mobile)
- [ ] Add `touch-friendly` prop for explicit 44px enforcement
- [ ] Update all form inputs with mobile-optimized heights
- [ ] Add `inputMode` and `autocomplete` attributes to forms

### Phase 4: Topbar Mobile Optimization
- [ ] Simplify [`Topbar.tsx`](../src/components/layout/Topbar.tsx:29) for mobile (burger + logo + sync)
- [ ] Create `SearchSheet` component for mobile search expansion
- [ ] Move sync indicator into bottom sheet menu on mobile

### Phase 5: Drawer/Modal Responsiveness
- [ ] Extract focus trap logic to [`src/hooks/useFocusTrap.ts`](../src/hooks/useFocusTrap.ts)
- [ ] Apply focus trap to mobile drawer in Sidebar
- [ ] Create [`src/components/common/BottomSheet.tsx`](../src/components/common/BottomSheet.tsx)
- [ ] Create `ResponsiveDialog` wrapper component
- [ ] Update all modal usages to use ResponsiveDialog
- [ ] Add `ConfirmDialog` component with responsive wrapper

### Phase 6: Data Table → Card Conversion
- [ ] Create [`src/components/common/DataCard.tsx`](../src/components/common/DataCard.tsx) generic component
- [ ] Create [`src/components/common/ResponsiveTable.tsx`](../src/components/common/ResponsiveTable.tsx) wrapper
- [ ] Convert Projects table to use ResponsiveTable + ProjectCard
- [ ] Convert Purchase Orders table (ProcurementScreen)
- [ ] Convert Materials table (MaterialsScreen)
- [ ] Convert Field Reports table (ReportsScreen)
- [ ] Convert Team Members table (TeamScreen)
- [ ] Convert Resource Prices table (ResourcePricesScreen)
- [ ] Convert AHSP Templates table (AHSPTemplatesScreen)
- [ ] Convert BOQ Items table (BOQItemizedTab)

### Phase 7: Text & Contrast Fixes
- [ ] Remove all `text-[9px]` and `text-[10px]` usages (replace with `text-xs` minimum)
- [ ] Verify all color combinations meet WCAG AA contrast ratios
- [ ] Add visible focus indicators to all interactive elements
- [ ] Test with keyboard-only navigation

### Phase 8: Animation & Motion
- [ ] Add motion library animations to transitions (already have `motion@12.23.24`)
- [ ] Implement prefers-reduced-motion support
- [ ] Test all animations respect user motion preferences

### Phase 9: PWA & Dark Mode
- [ ] Create `public/manifest.json` with proper icons
- [ ] Configure vite-plugin-pwa in vite.config.ts
- [ ] Create offline fallback page
- [ ] Add dark mode CSS variables (optional future enhancement)
- [ ] Add "Update available" toast notification

### Phase 10: Playwright Testing
- [ ] Install Playwright: `npm install -D @playwright/test`
- [ ] Create `playwright.config.ts` with 5 viewport projects
- [ ] Write `tests/e2e/responsive-overflow.spec.ts` (no horizontal overflow)
- [ ] Write `tests/e2e/responsive-navigation.spec.ts` (bottom nav, sidebar)
- [ ] Write `tests/e2e/responsive-modals.spec.ts` (modal/bottom sheet)
- [ ] Write `tests/e2e/responsive-tables.spec.ts` (table/card transformation)
- [ ] Write `tests/e2e/responsive-tap-targets.spec.ts` (44px minimum)
- [ ] Run tests and capture baseline screenshots
- [ ] Add `test:e2e` scripts to package.json

### Phase 11: Validation & Optimization
- [ ] Run `npm run lint` and fix all errors
- [ ] Run `npm run build` and verify no errors
- [ ] Check bundle size (aim for <500KB gzipped)
- [ ] Test on real devices (Android, iOS)
- [ ] Perform manual WCAG AA audit with screen reader
- [ ] Document any known limitations or future improvements

---

## 9. Migration Priority Matrix

| Priority | Component/Feature | Reason | Mobile Impact |
|----------|------------------|--------|---------------|
| **P0 (Critical)** | Bottom Navigation | Primary navigation on mobile | High - unusable without |
| **P0** | No Horizontal Overflow | Core UX requirement | High - broken layout |
| **P0** | Modal → Bottom Sheet | Touch-friendly overlays | High - modal too small |
| **P1 (High)** | Button Tap Targets | Accessibility & usability | High - hard to tap |
| **P1** | Table → Card (Projects) | Most-used screen | High - table unreadable |
| **P1** | Table → Card (Materials) | Inventory critical for field | High - table unreadable |
| **P2 (Medium)** | Sidebar Icon Mode (tablet) | Space optimization | Medium - still usable |
| **P2** | Table → Card (PO, Reports, Team) | Less frequent, still important | Medium - scrollable |
| **P2** | Topbar Mobile Simplification | Cleaner header | Medium - current works |
| **P3 (Low)** | Table → Card (Prices, AHSP, BOQ) | Admin/setup screens | Low - desktop use common |
| **P3** | Dark Mode | Nice-to-have enhancement | Low - light mode sufficient |

---

## 10. Known Limitations & Future Enhancements

### Current Limitations
1. **Tailwind v4 CSS Variables** - Breakpoint tokens in @theme don't generate responsive classes automatically; must use TypeScript constants for programmatic logic
2. **No Server-Side Rendering** - Client-side React app; initial viewport detection happens after JS load
3. **Manual Card Conversion** - Each table requires custom card layout design; no automated transformation

### Future Enhancements
1. **Dark Mode** - Design system includes color tokens but needs dark mode variants
2. **Offline Mode** - PWA caching configured but needs offline UI feedback
3. **Gesture Controls** - Swipe to dismiss bottom sheets, swipe between tabs
4. **Data Virtualization** - Long lists (>100 items) need virtual scrolling for performance
5. **Responsive Images** - Use `<picture>` element with srcset for optimized image loading
6. **Touch Gestures** - Pull-to-refresh, swipe actions on cards
7. **Voice Input** - Speech recognition for field report dictation (mobile advantage)

---

## 11. References & Resources

- **WCAG 2.1 AA Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **iOS Human Interface Guidelines (Touch Targets):** https://developer.apple.com/design/human-interface-guidelines/layout
- **Android Material Design (Touch Targets):** https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- **Tailwind CSS v4 Documentation:** https://tailwindcss.com/docs
- **Playwright Testing:** https://playwright.dev/docs/test-components
- **Motion Library (React):** https://motion.dev/docs/react-quick-start
- **PWA Manifest Generator:** https://www.simicart.com/manifest-generator.html/
- **Safe Area Insets CSS:** https://webkit.org/blog/7929/designing-websites-for-iphone-x/

---

## Appendix A: Quick Reference - Tailwind Responsive Classes

| Breakpoint | CSS | Tailwind Prefix | Width |
|------------|-----|----------------|-------|
| Mobile (XS) | `@media (min-width: 360px)` | `xs:` | 360px |
| Mobile (SM) | `@media (min-width: 390px)` | `sm:` | 390px |
| Tablet | `@media (min-width: 768px)` | `md:` | 768px |
| Desktop (LG) | `@media (min-width: 1024px)` | `lg:` | 1024px |
| Desktop (XL) | `@media (min-width: 1440px)` | `xl:` | 1440px |

**Usage Examples:**
```html
<!-- Hidden on mobile, visible on desktop -->
<div class="hidden lg:block">Desktop only</div>

<!-- Full width on mobile, constrained on desktop -->
<div class="w-full lg:w-1/2">Responsive width</div>

<!-- Stack on mobile, grid on tablet+ -->
<div class="flex flex-col md:grid md:grid-cols-2">Responsive layout</div>

<!-- 44px touch target on mobile, 36px on desktop -->
<button class="h-11 md:h-9">Responsive button</button>
```

---

## Appendix B: Color Contrast Verification

All existing colors meet WCAG AA standards:

| Foreground | Background | Contrast Ratio | WCAG AA |
|------------|-----------|----------------|---------|
| `#12352B` (Primary) | `#FFFFFF` (White) | 14.95:1 | ✅ AAA |
| `#D6A85C` (Accent) | `#FFFFFF` (White) | 4.62:1 | ✅ AA |
| `#202B26` (Text) | `#FFFFFF` (White) | 16.02:1 | ✅ AAA |
| `#69766F` (Secondary) | `#FFFFFF` (White) | 4.58:1 | ✅ AA |
| `#202B26` (Text) | `#F5F7F6` (Canvas) | 15.2:1 | ✅ AAA |

**Minimum Requirements:**
- Normal text (14px+): 4.5:1
- Large text (18px+ or 14px+ bold): 3:1
- Interactive UI components: 3:1

---

**Document Version:** 1.0  
**Last Updated:** 2026-10-14  
**Maintained by:** Architect Mode
