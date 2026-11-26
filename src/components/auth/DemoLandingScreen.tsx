import { ArrowRight, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function DemoLandingScreen() {
  const { status, config, error, enterDemo } = useAuth();
  const isInitializing = status === 'initializing';
  const isSigningIn = status === 'signing_in';
  const demoLoginEnabled = Boolean(config?.demo_login_enabled);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[var(--color-canvas)] px-4 py-10 text-[var(--color-ink)] sm:px-6">
      <div className="mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-[15px] font-semibold tracking-tight text-white"
              aria-hidden="true"
            >
              S
            </span>
            <span className="text-[13px] font-medium tracking-[0.02em] text-[var(--color-ink-subtle)]">
              Operations &amp; Intelligence
            </span>
          </div>

          <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-ink)] sm:text-[32px]">
            Sponsorship Growth Platform
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
            Demo environment: simulated 2026 season plus read-only 2025 history
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-md border border-[#DC2626]/30 bg-[#DC2626]/5 px-4 py-3 text-[14px] text-[#991B1B]"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-8 border-t border-[var(--color-border-subtle)] pt-6">
            {isInitializing ? (
              <div className="flex items-center gap-3 text-[14px] text-[var(--color-ink-muted)]">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                <span>Checking server session configuration...</span>
              </div>
            ) : demoLoginEnabled ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => void enterDemo()}
                  disabled={isSigningIn}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <span>{isSigningIn ? 'Signing in...' : 'Enter demo'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <p className="text-[13px] text-[var(--color-ink-subtle)]">
                  Signs in on the server with the configured demo account. All
                  changes are recorded in the audit log.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-4 py-3.5 text-[14px] text-[var(--color-ink-muted)]">
                <Lock
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-[var(--color-ink)]">
                    Demo sign-in is not enabled
                  </p>
                  <p className="mt-0.5 text-[13px] text-[var(--color-ink-subtle)]">
                    The server has not enabled one-click demo access for this
                    environment.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
