export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/**
 * Classifies error into standard AppError subclasses if not already an AppError
 */
export function classifyError(err: any): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const msg = err?.message || 'Terjadi kesalahan pada server.';

  if (
    msg.includes('Akses ditolak') ||
    msg.includes('SoD') ||
    msg.includes('tidak memiliki wewenang') ||
    msg.includes('tidak memiliki hak akses') ||
    msg.includes('tidak berwenang') ||
    msg.includes('Bukan anggota aktif') ||
    msg.includes('tidak terdaftar sebagai anggota') ||
    msg.includes('Segregation of Duties')
  ) {
    return new ForbiddenError(msg);
  }

  if (
    msg.includes('tidak ditemukan') ||
    msg.includes('not found')
  ) {
    return new NotFoundError(msg);
  }

  if (
    msg.includes('sudah ada') ||
    msg.includes('already exists') ||
    msg.includes('sudah disahkan') ||
    msg.includes('Illegal state transition')
  ) {
    return new ConflictError(msg);
  }

  if (
    msg.includes('wajib') ||
    msg.includes('tidak valid') ||
    msg.includes('tidak boleh') ||
    msg.includes('tidak mencukupi') ||
    msg.includes('tidak lengkap') ||
    msg.includes('melebihi pagu') ||
    msg.includes('harus lebih besar') ||
    msg.includes('tidak didukung')
  ) {
    return new ValidationError(msg);
  }

  return new AppError(msg, err?.statusCode || 500);
}
