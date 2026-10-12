import React from 'react';
import { Coins, TrendingUp, CheckCircle2 } from 'lucide-react';
import { MetricCard } from '../../common/MetricCard';
import { formatCompactIDR, formatPercent } from '../../../utils/formatters';

interface BudgetSummaryCardsProps {
  contractValue: number;
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
  cpi: number;
  utilization: number;
}

export const BudgetSummaryCards: React.FC<BudgetSummaryCardsProps> = ({
  contractValue,
  totalPlanned,
  totalActual,
  totalVariance,
  cpi,
  utilization,
}) => {
  const grossMargin = ((contractValue - totalPlanned) / (contractValue || 1)) * 100;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Nilai Kontrak Proyek"
        value={formatCompactIDR(contractValue)}
        subtitle="Nilai kontrak induk resmi (exclude PPN)"
        icon={<Coins className="w-4 h-4 text-[#12352B]" />}
      />

      <MetricCard
        label="Pagu Anggaran RAB"
        value={formatCompactIDR(totalPlanned)}
        subtitle={`Margin Kotor: ${formatPercent(grossMargin)}`}
        icon={<Coins className="w-4 h-4 text-[#285744]" />}
      />

      <MetricCard
        label="Realisasi Biaya Aktual"
        value={formatCompactIDR(totalActual)}
        subtitle={`${formatPercent((totalActual / (totalPlanned || 1)) * 100)} dari total pagu`}
        trend={{
          value: 'CPI ' + cpi.toFixed(2),
          isPositive: cpi >= 1,
          label: cpi >= 1 ? 'Efisien' : 'Overrun',
        }}
        icon={<TrendingUp className="w-4 h-4 text-[#1C6843]" />}
      />

      <MetricCard
        label="Sisa Pagu Anggaran"
        value={formatCompactIDR(totalVariance)}
        subtitle="Sisa pagu tersedia untuk sisa WBS"
        trend={{
          value: formatPercent(100 - utilization),
          isPositive: totalVariance >= 0,
          label: totalVariance >= 0 ? 'saldo aman' : 'overbudget',
        }}
        icon={<CheckCircle2 className="w-4 h-4 text-[#1C6843]" />}
      />
    </div>
  );
};
