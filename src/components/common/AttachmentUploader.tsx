/**
 * AttachmentUploader.tsx
 * Komponen pengunggah dan galeri lampiran foto/dokumen untuk Indotek Pro.
 * - Kompresi gambar di klien (maks sisi 1600px, JPEG 0.75).
 * - Unggah ke path: <workspace_id>/<record_type>/<record_id>/<uuid>.<ext>
 * - Simpan baris ke public.attachments.
 * - Tampilkan galeri dengan signed URL (60 detik) dan tombol perbarui URL.
 * - Mobile-first: touch target >= 44px.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  X,
  Trash2,
  RefreshCw,
  FileText,
  Eye,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { compressImage } from '../../utils/imageCompression';
import { supabaseDataService } from '../../services/supabaseDataService';
import { AttachmentItem, AttachmentRecordType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';

interface AttachmentUploaderProps {
  workspaceId: string;
  recordType: AttachmentRecordType;
  recordId: string;
  title?: string;
  readOnly?: boolean;
  maxFiles?: number;
  onUploadSuccess?: (item: AttachmentItem) => void;
  onDeleteSuccess?: (id: string) => void;
}

export const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  workspaceId,
  recordType,
  recordId,
  title = 'Foto & Lampiran Bukti',
  readOnly = false,
  maxFiles = 10,
  onUploadSuccess,
  onDeleteSuccess,
}) => {
  const { currentUser, activeRole } = useAuth();
  const { addToast } = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [captionInput, setCaptionInput] = useState('');
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [previewCaption, setPreviewCaption] = useState<string>('');

  const isOwner = activeRole === 'Owner / Director';

  // Muat daftar lampiran
  const loadAttachments = async () => {
    if (!recordId || !workspaceId) return;
    setLoading(true);
    try {
      const items = await supabaseDataService.getAttachments({
        workspaceId,
        recordType,
        recordId,
      });
      setAttachments(items);
    } catch (err: any) {
      console.error('Gagal memuat lampiran:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
  }, [workspaceId, recordType, recordId]);

  // Handle upload file dengan kompresi
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > maxFiles) {
      addToast({
        type: 'warning',
        title: 'Batas Lampiran Tercapai',
        message: `Maksimal lampiran adalah ${maxFiles} file.`,
      });
      return;
    }

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        setUploadProgressMsg(`Mengompres foto ${i + 1}/${files.length}...`);
        const compressed = await compressImage(file, 1600, 0.75);

        setUploadProgressMsg(`Mengunggah ke penyimpanan cloud...`);
        const newAttachment = await supabaseDataService.uploadAttachment({
          workspaceId,
          recordType,
          recordId,
          fileBlob: compressed.blob,
          fileName: compressed.fileName,
          mimeType: compressed.mimeType,
          sizeBytes: compressed.compressedSize,
          caption: captionInput.trim(),
          userId: currentUser?.uid,
        });

        setAttachments((prev) => [newAttachment, ...prev]);
        setCaptionInput('');
        onUploadSuccess?.(newAttachment);

        const origKb = Math.round(compressed.originalSize / 1024);
        const compKb = Math.round(compressed.compressedSize / 1024);
        const savedPercent = Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100);

        addToast({
          type: 'success',
          title: 'Foto Terunggah',
          message: `${compressed.fileName} berhasil disimpan (${compKb} KB, hemat ${savedPercent}% dari ${origKb} KB).`,
        });
      } catch (err: any) {
        addToast({
          type: 'danger',
          title: 'Gagal Mengunggah',
          message: err.message || 'Terjadi kesalahan saat mengunggah foto.',
        });
      }
    }

    setUploading(false);
    setUploadProgressMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle hapus lampiran (hanya jika pemilik atau Owner)
  const handleDelete = async (item: AttachmentItem) => {
    const canDelete = isOwner || item.uploaded_by === currentUser?.uid;
    if (!canDelete) {
      addToast({
        type: 'danger',
        title: 'Akses Ditolak',
        message: 'Hanya pengunggah foto atau Owner yang dapat menghapus lampiran ini.',
      });
      return;
    }

    if (!confirm('Hapus lampiran ini secara permanen?')) return;

    try {
      await supabaseDataService.deleteAttachment({
        id: item.id,
        storagePath: item.storage_path,
      });

      setAttachments((prev) => prev.filter((a) => a.id !== item.id));
      onDeleteSuccess?.(item.id);

      addToast({
        type: 'info',
        title: 'Terhapus',
        message: 'Lampiran berhasil dihapus.',
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menghapus',
        message: err.message,
      });
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-indigo-400" />
          <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">
            {attachments.length}/{maxFiles}
          </span>
        </div>

        <button
          type="button"
          onClick={loadAttachments}
          disabled={loading}
          title="Perbarui URL signed galeri"
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs text-slate-400 hover:text-slate-200 transition bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          Perbarui Link
        </button>
      </div>

      {/* Upload Zone (jika tidak readOnly) */}
      {!readOnly && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Catatan / keterangan foto (opsional, contoh: Cor Plat Lantai 2)..."
              value={captionInput}
              onChange={(e) => setCaptionInput(e.target.value)}
              disabled={uploading}
              className="flex-1 min-h-[44px] bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id={`attachment-input-${recordId}`}
              disabled={uploading}
            />

            <label
              htmlFor={`attachment-input-${recordId}`}
              className={`min-h-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition shadow-sm ${
                uploading ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-xs sm:text-sm">{uploadProgressMsg || 'Mengunggah...'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Ambil / Pilih Foto</span>
                </>
              )}
            </label>
          </div>
          <p className="text-xs text-slate-400">
            * Foto otomatis dikompres ke maks 1600px JPEG 75% di perangkat untuk menghemat kuota lapangan.
          </p>
        </div>
      )}

      {/* Gallery List */}
      {loading && attachments.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">Memuat galeri lampiran...</div>
      ) : attachments.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-slate-800 rounded-lg">
          <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Belum ada foto atau dokumen lampiran yang diunggah.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {attachments.map((item) => {
            const isImage = item.mime_type?.startsWith('image/') || item.storage_path.endsWith('.jpg') || item.storage_path.endsWith('.png');
            const canDelete = !readOnly && (isOwner || item.uploaded_by === currentUser?.uid);

            return (
              <div
                key={item.id}
                className="group relative bg-slate-800/80 border border-slate-700/80 rounded-lg overflow-hidden flex flex-col transition hover:border-slate-600"
              >
                {/* Thumbnail */}
                <div
                  className="aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer relative"
                  onClick={() => {
                    if (item.signed_url) {
                      setPreviewModalUrl(item.signed_url);
                      setPreviewCaption(item.caption || 'Lampiran Dokumen');
                    }
                  }}
                >
                  {isImage && item.signed_url ? (
                    <img
                      src={item.signed_url}
                      alt={item.caption || 'Foto Lampiran'}
                      className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                      <FileText className="w-8 h-8 text-indigo-400 mb-1" />
                      <span className="text-xs truncate max-w-[100px]">{item.storage_path.split('/').pop()}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                </div>

                {/* Caption & Metadata */}
                <div className="p-2 flex flex-col justify-between flex-1">
                  <div className="min-h-[24px]">
                    <p className="text-xs text-slate-200 font-medium truncate" title={item.caption || item.storage_path.split('/').pop()}>
                      {item.caption || item.storage_path.split('/').pop()}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.size_bytes ? `${Math.round(item.size_bytes / 1024)} KB` : ''} •{' '}
                      {new Date(item.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>

                  {canDelete && (
                    <div className="mt-2 pt-1 border-t border-slate-700/60 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                        title="Hapus foto ini"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded p-1 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Preview Foto */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-950/80">
              <span className="text-sm font-semibold text-slate-200 truncate pr-4">{previewCaption}</span>
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex-1 overflow-auto flex items-center justify-center bg-black/50">
              <img
                src={previewModalUrl}
                alt={previewCaption}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AttachmentUploader;
