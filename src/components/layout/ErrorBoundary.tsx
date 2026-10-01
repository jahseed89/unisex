import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Top-level error boundary.
 *
 * Catches render-time failures so one broken route cannot blank the whole
 * application. In production it shows a recovery path; in development it also
 * surfaces the stack, which is otherwise easy to lose inside React's console.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null })
    console.error('[unhandled]', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ error: null, componentStack: null })
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    const isDev = import.meta.env.DEV

    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-20">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertOctagon className="size-6" aria-hidden />
          </div>

          <h1 className="font-display text-2xl font-semibold text-ink">
            Something went wrong on our side
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            An unexpected error interrupted this page. Trying again usually resolves it — nothing
            you have entered has been lost.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
            <Button size="lg" variant="outline" onClick={this.handleReset}>
              Try again
            </Button>
          </div>

          {isDev && (
            <details className="mt-10 rounded-lg border border-line bg-sand p-4 text-left">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted">
                Development detail
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[0.6875rem] leading-relaxed text-danger">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
                {componentStack ? `\n\n${componentStack}` : ''}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
