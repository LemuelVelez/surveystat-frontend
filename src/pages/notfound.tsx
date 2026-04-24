import { ArrowLeft } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import logo from "@/assets/images/logo.svg"

export function NotFound() {
  const navigate = useNavigate()

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <Link
        to="/"
        className="absolute left-6 top-6 inline-flex items-center justify-center rounded-2xl bg-white p-2 shadow-xl shadow-cyan-400/20"
      >
        <img src={logo} alt="SurveyStat logo" className="h-12 w-auto" />
      </Link>

      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-slate-950/40 backdrop-blur">
        <div className="mx-auto inline-flex rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100">
          404 Error
        </div>

        <h1 className="mt-8 text-4xl font-black tracking-tight md:text-5xl">Page not found</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
          The page you are looking for does not exist or may have been moved. Please return to the SurveyStat homepage.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="size-4" />
            Go Back
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
          >
            Back Home
          </Link>
        </div>
      </section>
    </main>
  )
}

export default NotFound