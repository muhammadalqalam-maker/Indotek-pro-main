/**
 * Pagination helpers for server-side paginated list views.
 * Exposes typed wrappers around supabaseDataService paginated methods.
 * Each hook returns { items, total, page, pageSize, setPage, loading, error, reload }.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabaseDataService } from '../services/supabaseDataService';
import { PurchaseOrder, StockMutation, PettyCashEntry, FieldReport, AuditLogEntry } from '../types';

export const PAGE_SIZE = 50;

/** Generic paginated state + fetch hook */
function usePaged<T, Opts extends object>(
  fetcher: (opts: Opts & { page: number; pageSize: number }) => Promise<{ items: T[]; total: number }>,
  opts: Opts,
  /** Extra deps that should trigger a reload (e.g. workspaceId, filter values) */
  deps: unknown[]
) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher({ ...opts, page: p, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotal(result.total);
    } catch (err: any) {
      setError(err?.message ?? 'Terjadi kesalahan saat memuat data.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);

  useEffect(() => {
    load(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);

  const reload = () => load(page);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return { items, total, totalPages, page, setPage, loading, error, reload };
}

// ---------------------------------------------------------------------------
// Typed hooks for each domain
// ---------------------------------------------------------------------------

export function usePurchaseOrdersPaged(opts: {
  status?: string;
  projectId?: string;
  search?: string;
  wsId?: string;
}) {
  return usePaged<PurchaseOrder, typeof opts>(
    (o) => supabaseDataService.getPurchaseOrdersPaged(o),
    opts,
    [opts.status, opts.projectId, opts.search, opts.wsId]
  );
}

export function useStockMutationsPaged(opts: {
  materialId?: string;
  type?: 'Masuk' | 'Keluar';
  wsId?: string;
}) {
  return usePaged<StockMutation, typeof opts>(
    (o) => supabaseDataService.getStockMutationsPaged(o),
    opts,
    [opts.materialId, opts.type, opts.wsId]
  );
}

export function usePettyCashPaged(opts: {
  status?: string;
  projectId?: string;
  wsId?: string;
}) {
  return usePaged<PettyCashEntry, typeof opts>(
    (o) => supabaseDataService.getPettyCashPaged(o),
    opts,
    [opts.status, opts.projectId, opts.wsId]
  );
}

export function useFieldReportsPaged(opts: {
  status?: string;
  projectId?: string;
  search?: string;
  wsId?: string;
}) {
  return usePaged<FieldReport, typeof opts>(
    (o) => supabaseDataService.getFieldReportsPaged(o),
    opts,
    [opts.status, opts.projectId, opts.search, opts.wsId]
  );
}

export function useAuditLogsPaged(opts: {
  action?: string;
  recordType?: string;
  wsId?: string;
}) {
  return usePaged<AuditLogEntry, typeof opts>(
    (o) => supabaseDataService.getAuditLogsPaged(o),
    opts,
    [opts.action, opts.recordType, opts.wsId]
  );
}
