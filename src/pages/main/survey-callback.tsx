import { BarChart3, CheckCircle2, HeartHandshake, Home, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"

import logoUrl from "@/assets/images/logo.svg"

export function SurveyCallback() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-100 text-slate-950">
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="absolute left-8 top-10 size-40 rounded-full bg-cyan-200/50 blur-3xl" />
        <div className="absolute bottom-10 right-8 size-56 rounded-full bg-emerald-200/50 blur-3xl" />

        <section className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 text-center shadow-2xl shadow-slate-300/50 backdrop-blur sm:p-8 lg:p-10">
          <div className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-slate-950 p-4 shadow-xl shadow-slate-300/70">
            <img src={logoUrl} alt="SurveyStat logo" className="size-full object-contain" />
          </div>

          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-700">
            <Sparkles className="size-4" />
            Survey Completed
          </div>

          <h1 className="mx-auto mt-6 max-w-2xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Thank you for your valuable response.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            Your cooperation and honest feedback are deeply appreciated. Your response will help improve the quality of the study and strengthen the accuracy of the survey results.
          </p>

          <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <CheckCircle2 className="mx-auto size-8 text-cyan-600" />
              <p className="mt-3 text-sm font-black text-slate-950">Submitted</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <HeartHandshake className="mx-auto size-8 text-cyan-600" />
              <p className="mt-3 text-sm font-black text-slate-950">Appreciated</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <BarChart3 className="mx-auto size-8 text-cyan-600" />
              <p className="mt-3 text-sm font-black text-slate-950">Recorded</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 sm:w-auto"
            >
              <Home className="size-4" />
              Back to Home
            </Link>
            <Link
              to="/survey"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Answer Another Survey
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

export default SurveyCallback