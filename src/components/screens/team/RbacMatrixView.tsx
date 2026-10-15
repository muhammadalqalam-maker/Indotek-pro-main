import React from 'react';
import { Check } from 'lucide-react';
import { ALL_ROLES, ROLE_DEFINITIONS, hasGlobalProjectAccess } from '../../../lib/rbac';

export const RbacMatrixView: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8E4]">
          <h2 className="text-sm font-bold text-[#202B26]">
            Matriks Hak Akses & Segregasi Tugas (8 Peran Standar)
          </h2>
          <p className="text-xs text-[#69766F] mt-0.5">
            Konfigurasi wewenang modul dan otorisasi transaksi pada sistem Indotek Pro
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                <th className="py-3 px-4 font-semibold min-w-[180px]">Peran (Role)</th>
                <th className="py-3 px-3 font-semibold text-center">Cakupan Proyek</th>
                <th className="py-3 px-3 font-semibold text-center">Revisi RAB</th>
                <th className="py-3 px-3 font-semibold text-center">Approval PO</th>
                <th className="py-3 px-3 font-semibold text-center">Opname Stok</th>
                <th className="py-3 px-3 font-semibold text-center">Laporan Site</th>
                <th className="py-3 px-3 font-semibold text-center">BAST Milestone</th>
                <th className="py-3 px-3 font-semibold text-center">Kelola Tim/Role</th>
                <th className="py-3 px-3 font-semibold text-center">Kas Kecil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E4]/70">
              {ALL_ROLES.map((roleKey) => {
                const rDef = ROLE_DEFINITIONS[roleKey];
                const isGlobal = hasGlobalProjectAccess(roleKey);

                return (
                  <tr key={roleKey} className="hover:bg-[#F5F7F6]/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#202B26]">{roleKey}</div>
                      <div className="text-xs text-[#69766F]">{rDef.department}</div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      {isGlobal ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-[#E5F4EB] text-[#1C6843]">
                          Global
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#EAEFEA] text-[#202B26]">
                          Proyek Site
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.budgetRevision ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.purchaseOrder ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.stockAdjustment ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.fieldReport ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.milestoneSignOff ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.roleManagement ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {rDef.approvalAuthorities.pettyCash ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E5F4EB] text-[#1C6843]">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#FAFBFB] text-[#CBD5CF]">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
