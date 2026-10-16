import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickProjectModal } from './QuickProjectModal';

const projectActions = vi.hoisted(() => ({
  setIsAddProjectModalOpen: vi.fn(),
  addProject: vi.fn(),
}));

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    isAddProjectModalOpen: true,
    ...projectActions,
  }),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}));

describe('QuickProjectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillRequiredFields = async () => {
    render(<QuickProjectModal />);
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Contoh: Gedung Laboratorium Terpadu ITB'),
      'Gedung Uji'
    );
    await user.type(
      screen.getByPlaceholderText('Contoh: PT Metropolitan Land Tbk'),
      'PT Klien Uji'
    );
    await user.type(
      screen.getByPlaceholderText('Contoh: Jl. Ganesha No. 10, Bandung'),
      'Makassar'
    );
    return user;
  };

  it('creates a project with an automatically generated code and closes only after success', async () => {
    projectActions.addProject.mockResolvedValue('project-uuid');
    const user = await fillRequiredFields();

    await user.click(screen.getByRole('button', { name: 'Simpan & Buka Portofolio' }));

    await waitFor(() => {
      expect(projectActions.addProject).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '',
          name: 'Gedung Uji',
          client: 'PT Klien Uji',
          location: 'Makassar',
        })
      );
      expect(projectActions.setIsAddProjectModalOpen).toHaveBeenCalledWith(false);
    });
  });

  it('keeps the form open and disables repeat submission while the project is saving', async () => {
    let resolveCreation!: (projectId: string) => void;
    projectActions.addProject.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveCreation = resolve;
      })
    );
    const user = await fillRequiredFields();

    await user.click(screen.getByRole('button', { name: 'Simpan & Buka Portofolio' }));

    const pendingButton = await screen.findByRole('button', { name: 'Menyimpan Proyek...' });
    expect(pendingButton).toBeDisabled();
    expect(projectActions.setIsAddProjectModalOpen).not.toHaveBeenCalled();

    resolveCreation('project-uuid');
    await waitFor(() => {
      expect(projectActions.setIsAddProjectModalOpen).toHaveBeenCalledWith(false);
    });
  });

  it('keeps the entered project details when project creation fails', async () => {
    projectActions.addProject.mockRejectedValue(new Error('Kode proyek sudah digunakan.'));
    const user = await fillRequiredFields();

    await user.click(screen.getByRole('button', { name: 'Simpan & Buka Portofolio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Kode proyek sudah digunakan.');
    expect(screen.getByPlaceholderText('Contoh: Gedung Laboratorium Terpadu ITB')).toHaveValue(
      'Gedung Uji'
    );
    expect(projectActions.setIsAddProjectModalOpen).not.toHaveBeenCalled();
  });

  it('shows required-field validation without calling project creation', async () => {
    const user = userEvent.setup();
    render(<QuickProjectModal />);

    await user.click(screen.getByRole('button', { name: 'Simpan & Buka Portofolio' }));

    expect(await screen.findByText('Nama proyek wajib diisi')).toBeInTheDocument();
    expect(projectActions.addProject).not.toHaveBeenCalled();
  });
});
