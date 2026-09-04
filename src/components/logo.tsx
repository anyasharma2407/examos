import Link from "next/link";
import { cn } from "@/lib/utils";

/** ExamOS wordmark. The mark is a simple progress arc — the product's core idea. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-[7px] bg-foreground text-background"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" strokeWidth="2.5">
          <path
            d="M4 13.5 9.5 19 20 6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[15px]">ExamOS</span>
    </Link>
  );
}
