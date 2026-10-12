import React from 'react';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { MaterialItem } from '../../../types';

interface MaterialsStockTableProps {
  filteredMaterials: MaterialItem[];
  onOpenMutation: (mat: MaterialItem) => void;
  onOpenAdjustment: (mat: MaterialItem) => void;
}

export const MaterialsStockTable: React.FC<MaterialsStockTableProps> = ({
  filteredMaterials,
  onOpenMutation,
  onOpenAdjustment,
}) => {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
              <th className="py-3 px-4 font-semibold text-left">Kode Material</th>
              <th className="py-3 px-4 font-semibold text-left">Nama & Spesifikasi</th>
              <th className="py-3 px-4 font-semibold text-left">Kategori</th>
              <th className="py-3 px-4 font-semibold text-right">Stok Saat Ini</th>
              <th className="py-3 px-4 font-semibold text-right hidden md:table-cell">Buffer Minimum</th>
              <th className="py-3 px-4 font-semibold text-left hidden lg:table-cell">Lokasi Gudang</th>
              <th className="py-3 px-4 font-semibold text-left hidden sm:table-cell">Supplier Utama</th>
              <th className="py-3 px-4 font-semibold text-left">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8E4]/70">
            {filteredMaterials.map((mat) => {
              const statusVariant =
                mat.status === 'Aman'
                  ? 'success'
                  : mat.status === 'Menipis'
                  ? 'warning'
                  : 'danger';

              return (
                <tr key={mat.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                    {mat.code}
                  </td>

                  <td className="py-3.5 px-4 min-w-[200px]">
                    <div className="font-semibold text-[#202B26] leading-snug">{mat.name}</div>
                    <div className="text-[11px] text-[#69766F] mt-0.5">{mat.specification}</div>
                  </td>

                  <td className="py-3.5 px-4 text-[#69766F] whitespace-nowrap">{mat.category}</td>

                  <td className="py-3.5 px-4 font-mono font-bold text-[#202B26] tabular-nums whitespace-nowrap text-right">
                    {mat.currentStock.toLocaleString('id-ID')} {mat.unit}
                  </td>

                  <td className="py-3.5 px-4 hidden md:table-cell font-mono text-[#69766F] tabular-nums whitespace-nowrap text-right">
                    {mat.minStock.toLocaleString('id-ID')} {mat.unit}
                  </td>

                  <td className="py-3.5 px-4 hidden lg:table-cell text-[#4F5D56] max-w-[160px] truncate">
                    {mat.warehouseLocation}
                  </td>

                  <td className="py-3.5 px-4 hidden sm:table-cell text-[#69766F] max-w-[160px] truncate">
                    {mat.primarySupplier}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <Badge variant={statusVariant} size="sm" dot>
                      {mat.status}
                    </Badge>
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onOpenMutation(mat)}
                    >
                      Mutasi
                    </Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onOpenAdjustment(mat)}
                    >
                      Opname
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
