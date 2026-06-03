import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArchitecturePage from './page';

describe('ArchitecturePage', () => {
  it('renderiza o blueprint com arquitetura, sincronizacao e wireframes', () => {
    render(<ArchitecturePage />);

    expect(
      screen.getByRole('heading', {
        name: 'Arquitetura, banco, fluxos e primeira camada visual do sistema',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Sincronizacao offline-first')).toBeTruthy();
    expect(screen.getByText('Wireframes funcionais')).toBeTruthy();
    expect(screen.getByText('Estrutura de pastas proposta')).toBeTruthy();
  });
});
