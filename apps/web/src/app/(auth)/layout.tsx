import { authCopy } from '@transport/shared';

/** Split screen for the auth flows: navy brand panel and the form. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="flex flex-col justify-between gap-10 bg-navy px-8 py-10 text-navy-foreground lg:px-14 lg:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase">{authCopy.appKicker}</p>
        <div className="space-y-6">
          <h1 className="text-4xl leading-tight lg:text-5xl">{authCopy.appName}</h1>
          <div className="h-1 w-24 rounded-full bg-accent" />
          <p className="max-w-md text-lg text-navy-foreground/75">{authCopy.tagline}</p>
        </div>
        <span aria-hidden />
      </aside>
      <main className="flex items-start justify-center px-4 py-10 sm:px-8 lg:items-center">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
