import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface PageErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface PageErrorBoundaryState {
  error: Error | null;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PageErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="surface-card">
        <p className="brand-chip">Recuperacao da tela</p>
        <h1 className="mt-3 font-display text-3xl font-black text-ink">
          {this.props.title ?? "Nao foi possivel abrir esta tela"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slateText">
          O painel encontrou um dado inesperado e interrompeu a renderizacao desta pagina. As demais rotinas do sistema continuam disponiveis.
        </p>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          Detalhe tecnico: {this.state.error.message}
        </div>
        <button type="button" className="primary-button mt-5" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          Recarregar tela
        </button>
      </section>
    );
  }
}
