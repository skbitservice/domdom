import { Component, type ReactNode } from 'react';
import { Button } from '@domdom/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary to catch render errors in the component tree.
 * Prevents a single component crash from breaking the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              We&apos;re sorry, but an unexpected error occurred.
            </p>
            {this.state.error && (
              <details className="mt-4 text-left text-xs text-zinc-500">
                <summary className="cursor-pointer">Error details</summary>
                <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-800">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <Button
              className="mt-6"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}