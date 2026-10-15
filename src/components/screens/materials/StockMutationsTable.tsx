import React from 'react';
import { Badge } from '../../common/Badge';
import { StockMutation } from '../../../types';
import { formatDateIndo, formatQuantity } from '../../../utils/formatters';

interface StockMutationsTableProps {
  stockMutations: StockMutation[];
}

export const StockMutationsTable: React.FC<StockMutationsTableProps> = ({ stockMutations }) => {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
              <th className="py-3 px-4 font-semibold text-left">No. Surat Jalan</th>
              <th className="py-3 px-4 font-semibold text-left">Tanggal</th>
              <th className="py-3 px-4 font-semibold text-left">Tipe Mutasi</th>
              <th className="py-3 px-4 font-semibold text-left">Nama Material</th>
              <th className="py-3 px-4 font-semibold text-right">Jumlah</th>
              <th className="py-3 px-4 font-semibold text-left">Alokasi / Tujuan Proyek</th>
              <th className="py-3 px-4 font-semibold text-left">Petugas Lapangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8E4]/70">
            {stockMutations.map((mut) => (
              <tr key={mut.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                  {mut.referenceNo}
                </td>
                <td className="py-3.5 px-4 font-mono tabular-nums text-[#69766F] whitespace-nowrap">
                  {formatDateIndo(mut.date)}
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <Badge variant={mut.type === 'Masuk' ? 'success' : 'neutral'} size="sm">
                    {mut.type === 'Masuk' ? 'Barang Masuk (IN)' : 'Pengeluaran (OUT)'}
                  </Badge>
                </td>
                <td className="py-3.5 px-4 font-semibold text-[#202B26]">
                  {mut.materialName}
                </td>
                <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-[#202B26] whitespace-nowrap text-right">
                  {formatQuantity(mut.quantity, mut.unit)}
                </td>
                <td className="py-3.5 px-4 text-[#4F5D56]">{mut.project}</td>
                <td className="py-3.5 px-4 text-[#69766F]">{mut.handler}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
