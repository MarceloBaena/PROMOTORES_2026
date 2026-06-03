import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plataforma Operacional de Promotores',
  description: 'Sistema corporativo para operacao, supervisao e administracao de promotores',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      style={
        {
          '--font-display': '"Aptos", "Segoe UI", "Trebuchet MS", sans-serif',
          '--font-mono': '"Consolas", "Courier New", monospace',
        } as CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
