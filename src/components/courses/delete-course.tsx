"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCourseAction } from "@/app/(app)/courses/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Deleting a course cascades to its material, topics, questions and practice
 * history, so it asks first.
 */
export function DeleteCourse({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="h-9">
          <Trash2 aria-hidden />
          Delete course
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {courseCode}?</DialogTitle>
          <DialogDescription>
            This also removes its uploaded material, topics, questions and your whole
            practice history for the course. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" className="h-9" onClick={() => setOpen(false)}>
            Keep course
          </Button>
          <form action={deleteCourseAction} className="sm:w-44">
            <input type="hidden" name="courseId" value={courseId} />
            <SubmitButton>Delete course</SubmitButton>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
