import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown wherever a student has no courses yet. Always offers the next action. */
export function NoCoursesYet({ heading = "No courses yet" }: { heading?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
        <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <BookOpen className="size-5" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h2 className="font-medium">{heading}</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground text-pretty">
            Add the course you are studying for. You will need its exam date and roughly
            how many hours a week you can give it.
          </p>
        </div>
        <Button asChild className="h-9 px-4">
          <Link href="/courses/new">
            <Plus aria-hidden />
            Add your first course
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
