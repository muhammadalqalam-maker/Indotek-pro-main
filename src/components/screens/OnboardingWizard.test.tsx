import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from './OnboardingWizard';

const { mockRpc, mockAddToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockAddToast: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ addToast: mockAddToast }),
}));

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the generated slug in sync while typing the company name', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard userEmail="admin@example.com" onComplete={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('PT Contoh Konstruksi Nusantara'), 'PT Konstruksi');

    expect(screen.getByPlaceholderText('contoh-konstruksi')).toHaveValue('pt-konstruksi');
  });

  it('shows RPC failures and restores the submit button', async () => {
    const user = userEvent.setup();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Slug sudah digunakan.' } });
    render(<OnboardingWizard userEmail="admin@example.com" onComplete={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('PT Contoh Konstruksi Nusantara'), 'PT Konstruksi');
    await user.click(screen.getByRole('button', { name: 'Buat Perusahaan & Mulai' }));

    expect(await screen.findByText('Slug sudah digunakan.')).toBeInTheDocument();
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'danger',
      title: 'Gagal Membuat Workspace',
      message: 'Slug sudah digunakan.',
    }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Buat Perusahaan & Mulai' })).not.toBeDisabled();
    });
  });

  it('blocks invalid slugs before calling the RPC', async () => {
    render(<OnboardingWizard userEmail="admin@example.com" onComplete={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('PT Contoh Konstruksi Nusantara'), {
      target: { value: 'PT Konstruksi' },
    });
    fireEvent.change(screen.getByPlaceholderText('contoh-konstruksi'), {
      target: { value: '--invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buat Perusahaan & Mulai' }));

    expect(await screen.findByText(/ID workspace harus 2–63 karakter/)).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
