import Link from "next/link";
import {
  ArrowRight,
  Check,
  CalendarClock,
  FileUp,
  Map,
  Target,
  TrendingDown,
} from "lucide-react";
import { PlanPreview } from "@/components/marketing/plan-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  {
    icon: FileUp,
    title: "Upload your material",
    body: "Lecture slides, tutorials, course outlines, past papers. PDF, DOCX, PPTX or plain text.",
  },
  {
    icon: Map,
    title: "Build your knowledge map",
    body: "ExamOS reads your material and extracts the topics your course actually covers — not a generic syllabus.",
  },
  {
    icon: Target,
    title: "Practice targeted questions",
    body: "Multiple choice, numerical and short-answer questions written from your own course content.",
  },
  {
    icon: TrendingDown,
    title: "Track your weaknesses",
    body: "Every mistake is recorded by topic, so repeated misunderstandings surface instead of hiding.",
  },
  {
    icon: CalendarClock,
    title: "Follow your daily plan",
    body: "Your available hours are allocated across topics by weakness, importance and how close the exam is.",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "A$0",
    cadence: "forever",
    description: "Enough to prove it works on one subject.",
    features: ["1 course", "3 uploads", "Knowledge map", "50 practice questions per month"],
    cta: "Start studying",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Student",
    price: "A$28",
    cadence: "per month",
    description: "For a full semester load.",
    features: [
      "Unlimited courses",
      "Unlimited uploads",
      "Unlimited practice questions",
      "Daily study plan",
      "Exam readiness tracking",
    ],
    cta: "Start studying",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Semester",
    price: "A$139",
    cadence: "per semester",
    description: "Everything in Student, paid once.",
    features: ["Everything in Student", "6 months access", "Priority document processing"],
    cta: "Start studying",
    href: "/signup",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-border/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Exam preparation, planned for you
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Stop wondering what to study.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              Upload your course material and ExamOS creates a personalised path to exam
              readiness.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-5 text-[15px]">
                <Link href="/signup">
                  Start studying
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-[15px]">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              Built for maths, computer science, physics and statistics — and any course where
              you have the material but not the plan.
            </p>
          </div>

          <PlanPreview />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-b border-border/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              Five steps from a folder of lecture slides to knowing exactly what to do this
              afternoon.
            </p>
          </div>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="bg-background p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <step.icon className="size-4" aria-hidden />
                  </span>
                  <span className="tabular text-xs font-medium text-muted-foreground">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground text-pretty">{step.body}</p>
              </li>
            ))}
            <li className="hidden bg-background p-6 lg:block" aria-hidden />
          </ol>
        </div>
      </section>

      {/* Feature detail */}
      <section id="features" className="scroll-mt-20 border-b border-border/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl text-balance">
              Grounded in your course, not the internet
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              Topics and questions are generated from the documents you upload and cite the
              material they came from. When your material does not cover something, ExamOS says
              so rather than inventing it.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Every topic links back to the lecture or tutorial it was found in.",
                "Questions test understanding, not recall of definitions.",
                "Mastery decays over time, so long-untouched topics resurface.",
                "Your files are private to your account and never shared.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-strong" aria-hidden />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card>
            <CardContent className="space-y-5">
              <div>
                <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                  Your knowledge
                </p>
                <p className="mt-1 text-sm text-muted-foreground">MATH1061 · 17 days remaining</p>
              </div>
              <ul className="space-y-3">
                {[
                  { topic: "Differentiation", score: 91 },
                  { topic: "Functions", score: 87 },
                  { topic: "Integration", score: 76 },
                  { topic: "Sequences", score: 63 },
                  { topic: "Probability", score: 41 },
                ].map((row) => (
                  <li key={row.topic} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span>{row.topic}</span>
                      <span className="tabular text-muted-foreground">{row.score}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={
                          row.score >= 80
                            ? "h-full rounded-full bg-strong"
                            : row.score >= 60
                              ? "h-full rounded-full bg-moderate"
                              : "h-full rounded-full bg-weak"
                        }
                        style={{ width: `${row.score}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-b border-border/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              Start free. Upgrade when it is carrying a whole semester. All prices in
              Australian dollars.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PRICING.map((tier) => (
              <Card
                key={tier.name}
                className={tier.highlighted ? "border-foreground/25 shadow-sm" : undefined}
              >
                <CardContent className="flex h-full flex-col gap-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{tier.name}</h3>
                      {tier.highlighted ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Most popular
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 flex items-baseline gap-1.5">
                      <span className="tabular text-3xl font-semibold tracking-tight">
                        {tier.price}
                      </span>
                      <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
                  </div>

                  <ul className="flex-1 space-y-2 text-sm">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    variant={tier.highlighted ? "default" : "outline"}
                    className="h-9 w-full"
                  >
                    <Link href={tier.href}>{tier.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Prices in Australian dollars. Billing is not enabled yet — every account
            currently has full access.
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="rounded-xl border border-border bg-muted/40 px-6 py-12 text-center sm:px-12">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              You already have the material. Get the plan.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground text-pretty">
              Create a course, upload one lecture and see what ExamOS thinks you should do
              today.
            </p>
            <Button asChild size="lg" className="mt-7 h-11 px-5 text-[15px]">
              <Link href="/signup">
                Start studying
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
