"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Component,
  type ErrorInfo,
  type JSX,
  type ReactNode,
  useCallback,
  useState,
} from "react";

export type PlayerDetailError = {
  status?: number;
  message?: string;
};

interface BoundaryProps {
  playerId: string;
  initialError?: PlayerDetailError | null;
  children?: ReactNode;
}

interface InnerProps extends BoundaryProps {
  onRetry: () => void;
}

interface State {
  hasError: boolean;
  error: PlayerDetailError | null;
}

function normaliseError(error: unknown, fallback?: string): PlayerDetailError {
  if (error && typeof error === "object") {
    const maybeStatus = (error as { status?: unknown }).status;
    const status = typeof maybeStatus === "number" ? maybeStatus : undefined;
    const message = (error as { message?: unknown }).message;
    return {
      status,
      message: typeof message === "string" && message.length > 0 ? message : fallback,
    };
  }
  return { message: fallback };
}

function getErrorCopy(error: PlayerDetailError | null) {
  const status = error?.status;
  if (status === 404) {
    return {
      title: "This player could not be found.",
      description:
        "The player might have been removed or the link you followed could be out of date.",
      statusNote: "Error code: 404",
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      title: "We ran into a temporary problem fetching this player.",
      description: "Please try again in a moment.",
      statusNote: `Error code: ${status}`,
    };
  }
  if (typeof status === "number" && status >= 400) {
    return {
      title: "We can't display this player right now.",
      description:
        "The request was rejected. You can try again or return to the players list.",
      statusNote: `Error code: ${status}`,
    };
  }
  return {
    title: "Unable to display this player right now.",
    description: "Something went wrong while loading the player details.",
    statusNote: undefined,
  };
}

class PlayerDetailErrorBoundaryInner extends Component<InnerProps, State> {
  constructor(props: InnerProps) {
    super(props);
    this.state = {
      hasError: Boolean(props.initialError),
      error: props.initialError ?? null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error: normaliseError(error, error.message),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Player detail rendering failed", {
      error,
      errorInfo,
      playerId: this.props.playerId,
    });
  }

  componentDidUpdate(prevProps: InnerProps) {
    if (prevProps.playerId !== this.props.playerId) {
      this.setState({
        hasError: Boolean(this.props.initialError),
        error: this.props.initialError ?? null,
      });
      return;
    }
    if (prevProps.initialError !== this.props.initialError) {
      this.setState({
        hasError: Boolean(this.props.initialError),
        error: this.props.initialError ?? null,
      });
    }
  }

  private handleRetry = () => {
    this.props.onRetry();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const copy = getErrorCopy(this.state.error);
      const message = this.state.error?.message;
      return (
        <div className="container">
          <div
            role="alert"
            className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p className="font-semibold">{copy.title}</p>
            <p className="mt-2">{copy.description}</p>
            {copy.statusNote ? (
              <p className="mt-2 font-medium">{copy.statusNote}</p>
            ) : null}
            {message && message !== copy.title ? (
              <p className="mt-2 break-words text-xs text-red-600">{message}</p>
            ) : null}
            <p className="mt-2">
              If the problem continues, {" "}
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
        </div>
      );
    }

    return this.props.children ?? null;
  }
}

export default function PlayerDetailErrorBoundary(
  props: BoundaryProps
): JSX.Element {
  const router = useRouter();
  const [resetKey, setResetKey] = useState(0);

  const handleRetry = useCallback(() => {
    setResetKey((key) => key + 1);
    router.refresh();
  }, [router]);

  return (
    <PlayerDetailErrorBoundaryInner
      key={`${props.playerId}-${resetKey}`}
      {...props}
      onRetry={handleRetry}
    />
  );
}
