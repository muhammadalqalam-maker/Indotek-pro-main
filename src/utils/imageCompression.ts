/**
 * imageCompression.ts
 * Utilitas kompresi gambar di sisi klien (browser).
 * Batasan: Sisi terpanjang maksimal 1600px, format JPEG kualitas 0.75 (75%).
 * Mengurangi ukuran file foto kamera smartphone dari 5-15MB menjadi ~150-400KB tanpa kehilangan detail konstruksi penting.
 */

export interface CompressionResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

/**
 * Menghitung dimensi skala proporsional dengan batas maksimum sisi
 */
export function calculateTargetDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number = 1600
): { width: number; height: number } {
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: origWidth, height: origHeight };
  }

  if (origWidth > origHeight) {
    return {
      width: maxDimension,
      height: Math.round((origHeight * maxDimension) / origWidth),
    };
  } else {
    return {
      width: Math.round((origWidth * maxDimension) / origHeight),
      height: maxDimension,
    };
  }
}

/**
 * Mengompres file gambar (JPEG/PNG/WebP/dll.) menjadi JPEG 0.75 dengan maks sisi 1600px
 */
export async function compressImage(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.75
): Promise<CompressionResult> {
  // Jika bukan gambar (misal file PDF), kembalikan langsung tanpa kompresi canvas
  if (!file.type.startsWith('image/')) {
    return {
      blob: file,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      originalSize: file.size,
      compressedSize: file.size,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat didekode oleh browser'));
      img.onload = () => {
        const { width, height } = calculateTargetDimensions(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          maxDimension
        );

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Tidak dapat menginisialisasi konteks 2D canvas'));
          return;
        }

        // Background putih untuk transparansi PNG agar tidak hitam saat jadi JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Gagal mengekspor blob kanvas JPEG'));
              return;
            }

            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            const newFileName = `${baseName}.jpg`;

            resolve({
              blob,
              fileName: newFileName,
              mimeType: 'image/jpeg',
              originalSize: file.size,
              compressedSize: blob.size,
              width,
              height,
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
