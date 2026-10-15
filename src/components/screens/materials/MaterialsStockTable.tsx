import React from 'react';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { DataCard } from '../../common/DataCard';
import { ResponsiveTable } from '../../common/ResponsiveTable';
import { MaterialItem } from '../../../types';
import { formatQuantity } from '../../../utils/formatters';

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
  const getStatusVariant = (status: string) => {
    return status === 'Aman'
      ? 'success'
      : status === 'Menipis'
      ? 'warning'
      : 'danger';
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
      <ResponsiveTable
        data={filteredMaterials}
        renderTable={() => (
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
                  const statusVariant = getStatusVariant(mat.status);

                  return (
                    <tr key={mat.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                        {mat.code}
                      </td>

                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="font-semibold text-[#202B26] leading-snug">{mat.name}</div>
                        <div className="text-xs text-[#69766F] mt-0.5">{mat.specification}</div>
                      </td>

                      <td className="py-3.5 px-4 text-[#69766F] whitespace-nowrap">{mat.category}</td>

                      <td className="py-3.5 px-4 font-mono font-bold text-[#202B26] tabular-nums whitespace-nowrap text-right">
                        {formatQuantity(mat.currentStock, mat.unit)}
                      </td>

                      <td className="py-3.5 px-4 hidden md:table-cell font-mono text-[#69766F] tabular-nums whitespace-nowrap text-right">
                        {formatQuantity(mat.minStock, mat.unit)}
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
        )}
        renderCard={(mat) => {
          const statusVariant = getStatusVariant(mat.status);

          return (
            <DataCard
              title={mat.code}
              subtitle={mat.name}
              metadata={[
                { label: 'Spesifikasi', value: mat.specification },
                { label: 'Kategori', value: mat.category },
                { label: 'Stok Saat Ini', value: formatQuantity(mat.currentStock, mat.unit), highlight: true },
                { label: 'Buffer Minimum', value: formatQuantity(mat.minStock, mat.unit) },
                { label: 'Lokasi Gudang', value: mat.warehouseLocation },
                { label: 'Supplier Utama', value: mat.primarySupplier },
                {
                  label: 'Status',
                  value: (
                    <Badge variant={statusVariant} size="sm" dot>
                      {mat.status}
                    </Badge>
                  ),
                },
              ]}
              actions={
                <div className="flex gap-2">
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
                </div>
              }
            />
          );
        }}
      />
    </div>
  );
};
