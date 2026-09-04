import { AppNav } from "@/components/app/app-nav";
import { UserMenu } from "@/components/app/user-menu";
import { Logo } from "@/components/logo";

export function AppHeader({ name, email }: { name: string | null; email: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Logo href="/dashboard" />
        <AppNav className="ml-2" />
        <div className="ml-auto">
          <UserMenu name={name} email={email} />
        </div>
      </div>
    </header>
  );
}
