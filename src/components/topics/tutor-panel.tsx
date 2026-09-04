"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AlertCircle, Loader2, Send, Square, Volume2 } from "lucide-react";
import { askTutorAction } from "@/app/(app)/courses/[courseId]/topics/[topicId]/actions";
import type { TutorState } from "@/app/(app)/courses/[courseId]/topics/[topicId]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Spoken tutor for one topic.
 *
 * Speech uses the browser's built-in synthesiser rather than a paid
 * text-to-speech API: it costs nothing, needs no extra key, works offline and
 * starts instantly. The trade-off is voice quality, which is a fair one for a
 * study aid. Where the API is unavailable the answer is still there to read.
 *
 * The transcript lives in the Server Action's state, not in component state —
 * `useActionState` passes the previous state to the action, so the conversation
 * accumulates there and there is no effect mirroring one into the other.
 */
/** Speech support never changes during a session, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};

/** Defined here, not in the action module: see the note beside `TutorState`. */
const INITIAL: TutorState = { turns: [] };

export function TutorPanel({ topicId, topicName }: { topicId: string; topicName: string }) {
  const [state, formAction, pending] = useActionState(askTutorAction, INITIAL);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const spokenUpTo = useRef(0);

  // Whether the browser can speak is a fact about the environment, not state:
  // reading it this way keeps the server render (false) and the first client
  // render consistent without an effect.
  const canSpeak = useSyncExternalStore(
    subscribeToNothing,
    () => "speechSynthesis" in window,
    () => false,
  );

  useEffect(() => {
    // Navigating away mid-sentence should not keep the browser talking.
    return () => window.speechSynthesis?.cancel();
  }, []);

  function speak(text: string, index: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    // Status is driven by the synthesiser's own events, so the button reflects
    // what is actually happening rather than what we asked for.
    utterance.onstart = () => setSpeakingIndex(index);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeakingIndex(null);
  }

  // Always defined: the initial state above supplies an empty array, and the
  // action always returns one. React Compiler handles the memoisation.
  const turns = state.turns;

  // Speaking is an external system, so driving it from an effect is right. The
  // ref makes it fire once per new answer rather than on every render.
  useEffect(() => {
    if (!autoSpeak || !canSpeak || turns.length === 0) return;
    if (spokenUpTo.current >= turns.length) return;
    spokenUpTo.current = turns.length;
    speak(turns[turns.length - 1].answer, turns.length - 1);
  }, [turns, autoSpeak, canSpeak]);

  // A submitted question should clear the box once it has been answered.
  useEffect(() => {
    if (!pending) formRef.current?.reset();
  }, [turns.length, pending]);

  return (
    <section aria-labelledby="tutor-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tutor-heading" className="font-medium">
            Ask the tutor
          </h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground text-pretty">
            Ask anything about {topicName}. Answers are taught from your own material and
            read aloud.
          </p>
        </div>

        {canSpeak ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(event) => {
                setAutoSpeak(event.target.checked);
                if (!event.target.checked) stopSpeaking();
              }}
              className="size-4 rounded border-border"
            />
            <Volume2 className="size-4" aria-hidden />
            Read aloud
          </label>
        ) : null}
      </div>

      {turns.length > 0 ? (
        <ol className="space-y-4">
          {turns.map((turn, index) => (
            <li key={`${index}-${turn.question}`} className="space-y-2">
              <p className="text-sm font-medium">{turn.question}</p>

              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="leading-relaxed text-pretty">{turn.answer}</p>

                {turn.followUp ? (
                  <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground text-pretty">
                    {turn.followUp}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {canSpeak ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        speakingIndex === index ? stopSpeaking() : speak(turn.answer, index)
                      }
                    >
                      {speakingIndex === index ? (
                        <>
                          <Square aria-hidden /> Stop
                        </>
                      ) : (
                        <>
                          <Volume2 aria-hidden /> Listen
                        </>
                      )}
                    </Button>
                  ) : null}

                  {!turn.groundedInMaterial ? (
                    <span className="text-xs text-moderate text-pretty">
                      Not covered by your uploaded material — your course may treat this
                      differently.
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-2">
        <input type="hidden" name="topicId" value={topicId} />
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <Textarea
          id="question"
          name="question"
          rows={2}
          maxLength={500}
          required
          placeholder={`e.g. Explain ${topicName} with a worked example`}
          onKeyDown={(event) => {
            // Enter sends; shift+enter starts a new line.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!pending) event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        {state.error ? (
          <p role="alert" className="flex gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" className="h-9" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {pending ? "Thinking…" : "Ask"}
          </Button>
        </div>
      </form>
    </section>
  );
}
