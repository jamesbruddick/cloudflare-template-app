import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CrashPage } from '@/pages/ErrorPage';

/**
 * Last-resort boundary around the router, for anything rendered outside it (providers added to main.tsx).
 * It never sees a page's error: React Router catches everything a route throws first, and `RouteCrashPage`
 * (the routes' `errorElement`) renders those.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    return <CrashPage standalone />;
  }
}
