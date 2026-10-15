#!/usr/bin/env node

const getLuminance = (hex) => {
  const rgb = parseInt(hex.slice(1), 16);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  const [rs, gs, bs] = [r, g, b].map(x => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const contrast = (fg, bg) => {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
};

const colors = {
  'text-main': '#202B26',
  'text-muted': '#69766F',
  'primary-forest': '#12352B',
  'primary-secondary': '#285744',
  'accent-gold': '#D6A85C'
};

const backgrounds = {
  'white': '#FFFFFF',
  'canvas': '#F5F7F6'
};

console.log('WCAG AA Contrast Ratios (need 4.5:1 normal, 3:1 large text):\n');
Object.entries(colors).forEach(([name, color]) => {
  Object.entries(backgrounds).forEach(([bgName, bg]) => {
    const ratio = contrast(color, bg);
    const pass = ratio >= 4.5 ? '✓ PASS' : ratio >= 3 ? '△ LARGE' : '✗ FAIL';
    console.log(`  ${name.padEnd(18)} on ${bgName.padEnd(8)}: ${ratio.padStart(4)} ${pass}`);
  });
  console.log('');
});
