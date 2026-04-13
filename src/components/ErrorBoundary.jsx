import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error || 'Ошибка') };
  }

  componentDidCatch() {
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[rgb(var(--orb-bg-rgb))] px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="w-full max-w-[520px]">
          <div className="orb-blur rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-[rgb(var(--orb-border-rgb))]">
            <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Что-то пошло не так</div>
            <div className="mt-2 text-xs text-[rgb(var(--orb-muted-rgb))]">{this.state.message}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
              >
                Перезагрузить
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 px-4 text-sm font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
