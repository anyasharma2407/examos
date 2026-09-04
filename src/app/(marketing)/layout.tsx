import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";

/**
 * The marketing shell reads no session, which keeps the landing page fully
 * static. A signed-in visitor who clicks "Log in" or "Start studying" is
 * redirected to the dashboard by src/proxy.ts.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
