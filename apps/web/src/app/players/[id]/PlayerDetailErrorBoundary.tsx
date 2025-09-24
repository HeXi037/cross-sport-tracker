'use client';

import Link from 'next/link';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

interface Props {
  playerId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class PlayerDetailErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Player detail rendering failed', {
      error,
      errorInfo,
      playerId: this.props.playerId,
    });
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.playerId !== this.props.playerId && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p className="font-semibold">Unable to display this player right now.</p>
          <p className="mt-2">
            Something went wrong while loading the player details. Please refresh
            the page or try again later.
          </p>
          <p className="mt-2">
            If the problem continues,{' '}
            <Link href="/players" className="underline">
              return to the players list
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-3 inline-flex items-center text-sm font-medium underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
