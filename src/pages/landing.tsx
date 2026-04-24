import { BarChart3, ClipboardCheck, DatabaseZap, LineChart, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

const features = [
  {
    title: "Survey Collection",
    description: "Collect respondent details, consent, and Likert-scale checklist answers in one guided form.",
    icon: ClipboardCheck,
  },
  {
    title: "Real-time Statistics",
    description: "Review weighted means, interpretation ranges, distributions, and response counts.",
    icon: BarChart3,
  },
  {
    title: "Interactive Tables",
    description: "Inspect survey sections and item-level statistics through AG Grid-powered data tables.",
    icon: DatabaseZap,
  },
]

export function Landing() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-8">
        <nav className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20">
              <LineChart className="size-6" />
            </span>
            <span className="text-xl">SurveyStat</span>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/survey"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Survey
            </Link>
            <Link
              to="/statistic"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Statistics
            </Link>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
              <ShieldCheck className="size-4" />
              Digital survey and statistical dashboard
            </div>

            <div className="space-y-6">
              <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white md:text-7xl">
                Collect survey responses and visualize results faster.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                SurveyStat helps respondents answer checklist questionnaires and lets evaluators review descriptive
                statistics through interactive Plotly charts and AG Grid tables.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/survey"
                className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:bg-cyan-300"
              >
                Answer Survey
              </Link>
              <Link
                to="/statistic"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View Statistics
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-cyan-950/50 backdrop-blur">
            <div className="rounded-2xl bg-slate-900 p-5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Survey Summary</p>
                  <h2 className="text-2xl font-bold">System Quality Evaluation</h2>
                </div>
                <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                  Active
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Responses", "128"],
                  ["Weighted Mean", "4.62"],
                  ["Interpretation", "Excellent"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{label}</p>
                    <p className="mt-2 text-2xl font-black">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                {features.map((feature) => (
                  <div key={feature.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                      <feature.icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-bold">{feature.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Landing
