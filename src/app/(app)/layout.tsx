import { AppHeader } from "@/components/app/app-header";
import { requireUser } from "@/lib/auth";

/**
 * Shell for every signed-in screen. `requireUser()` is the real access check —
 * src/proxy.ts only redirects early to avoid rendering a flash of the layout.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <AppHeader name={user.name} email={user.email} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
