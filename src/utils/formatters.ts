/**
 * Formats a number to Indonesian Rupiah (IDR) currency format.
 * e.g. 84500000000 -> "Rp 84.500.000.000"
 */
export function formatCurrencyIDR(amount: number): string {
  if (isNaN(amount)) return 'Rp 0';
  return 'Rp ' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Compact Indonesian Rupiah format for KPI cards and chart axes.
 * e.g. 84500000000 -> "Rp 84,5 M"
 * e.g. 750000000 -> "Rp 750 Jt"
 */
export function formatCompactIDR(amount: number): string {
  if (isNaN(amount)) return 'Rp 0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000_000_000) {
    const val = (abs / 1_000_000_000_000).toFixed(1).replace('.', ',');
    return `${sign}Rp ${val} T`;
  }
  if (abs >= 1_000_000_000) {
    const val = (abs / 1_000_000_000).toFixed(1).replace('.', ',');
    return `${sign}Rp ${val} M`;
  }
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(0);
    return `${sign}Rp ${val} Jt`;
  }
  if (abs >= 1_000) {
    const val = (abs / 1_000).toFixed(0);
    return `${sign}Rp ${val} Rb`;
  }
  return `${sign}Rp ${abs}`;
}

/**
 * Formats a date string (YYYY-MM-DD) into Indonesian standard date format.
 * e.g. "2026-10-09" -> "9 Okt 2026"
 */
export function formatDateIndo(dateStr: string, fullMonth = false): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0];

      const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const longMonths = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];

      const m = fullMonth ? longMonths[monthIdx] : shortMonths[monthIdx];
      return `${day} ${m} ${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Formats percentage with Indonesian comma separator.
 * e.g. 64.8 -> "64,8%"
 */
export function formatPercent(val: number, decimals = 1): string {
  if (isNaN(val)) return '0%';
  return val.toFixed(decimals).replace('.', ',') + '%';
}

/**
 * Formats thousands separator for quantities.
 * e.g. 14500 -> "14.500"
 */
export function formatNumber(val: number): string {
  if (isNaN(val)) return '0';
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
