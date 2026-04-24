import { useEffect, useMemo, useState, type SyntheticEvent } from "react"
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2, Send } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import {
  SurveyStatApiError,
  surveyStatService,
  type CreateRespondentPayload,
  type LikertValue,
  type SurveyForm,
  type SurveyQuestionnaireForm,
  type SubmitSurveyAnswerPayload,
} from "@/api/surveystat"

const defaultScale = [
  { value: 5 as LikertValue, label: "Strongly Agree" },
  { value: 4 as LikertValue, label: "Agree" },
  { value: 3 as LikertValue, label: "Neutral" },
  { value: 2 as LikertValue, label: "Disagree" },
  { value: 1 as LikertValue, label: "Strongly Disagree" },
]

const respondentRoles = ["Student", "Faculty", "QA Personnel", "Administrator", "Other"]

function getErrorMessage(error: unknown) {
  if (error instanceof SurveyStatApiError || error instanceof Error) {
    return error.message
  }

  return "Unable to process the request. Please try again."
}

function normalizeScale(scale: SurveyQuestionnaireForm["scale"] | undefined) {
  if (!Array.isArray(scale) || scale.length === 0) {
    return defaultScale
  }

  return [...scale].sort((a, b) => b.value - a.value)
}

function getAnsweredCount(answers: Record<string, LikertValue>) {
  return Object.values(answers).filter(Boolean).length
}

export function Survey() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [questionnaire, setQuestionnaire] = useState<SurveyQuestionnaireForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, LikertValue>>({})
  const [respondent, setRespondent] = useState<CreateRespondentPayload>({
    fullName: "",
    email: "",
    role: "Student",
    office: "",
    program: "",
    consentGiven: true,
  })
  const [respondentSignature, setRespondentSignature] = useState("")
  const [voluntaryConsent, setVoluntaryConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isQuestionnaireLoading, setIsQuestionnaireLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const allItems = useMemo(
    () => questionnaire?.sections.flatMap((section) => section.items) ?? [],
    [questionnaire],
  )
  const requiredItems = useMemo(() => allItems.filter((item) => item.isRequired), [allItems])
  const answeredCount = getAnsweredCount(answers)
  const scale = normalizeScale(questionnaire?.scale)
  const isComplete = requiredItems.every((item) => answers[item.id]) && voluntaryConsent

  useEffect(() => {
    let isMounted = true

    async function loadForms() {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const surveyForms = await surveyStatService.listSurveyForms(true)

        if (!isMounted) return

        setForms(surveyForms)
        setSelectedFormCode(surveyForms[0]?.code ?? "")
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(getErrorMessage(error))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadForms()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedFormCode) {
      setQuestionnaire(null)
      return
    }

    let isMounted = true

    async function loadQuestionnaire() {
      setIsQuestionnaireLoading(true)
      setErrorMessage("")

      try {
        const selectedQuestionnaire = await surveyStatService.getQuestionnaireByFormCode(selectedFormCode)

        if (!isMounted) return

        setQuestionnaire(selectedQuestionnaire)
        setAnswers({})
        setVoluntaryConsent(false)
      } catch (error) {
        if (!isMounted) return
        setQuestionnaire(null)
        setErrorMessage(getErrorMessage(error))
      } finally {
        if (isMounted) {
          setIsQuestionnaireLoading(false)
        }
      }
    }

    loadQuestionnaire()

    return () => {
      isMounted = false
    }
  }, [selectedFormCode])

  function updateRespondent<K extends keyof CreateRespondentPayload>(key: K, value: CreateRespondentPayload[K]) {
    setRespondent((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateAnswer(itemId: string, rating: LikertValue) {
    setAnswers((current) => ({
      ...current,
      [itemId]: rating,
    }))
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!questionnaire) {
      toast.error("Please select a survey form first.")
      return
    }

    if (!voluntaryConsent) {
      toast.error("Please confirm voluntary consent before submitting.")
      return
    }

    const missingRequiredItems = requiredItems.filter((item) => !answers[item.id])

    if (missingRequiredItems.length > 0) {
      toast.error("Please answer all required checklist items.")
      return
    }

    const payloadAnswers: SubmitSurveyAnswerPayload[] = allItems
      .filter((item) => answers[item.id])
      .map((item) => ({
        itemId: item.id,
        rating: answers[item.id],
      }))

    setIsSubmitting(true)

    try {
      await surveyStatService.submitSurveyResponse({
        formId: questionnaire.id,
        formCode: questionnaire.code,
        respondent,
        respondentSignature,
        voluntaryConsent,
        answers: payloadAnswers,
      })

      toast.success("Survey response submitted successfully.")
      setAnswers({})
      setRespondentSignature("")
      setVoluntaryConsent(false)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
            <div className="flex items-start gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950">
                <ClipboardList className="size-6" />
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">Survey Checklist</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Read each statement carefully, then select the rating that best reflects your evaluation.
                </p>
              </div>
            </div>
          </div>

          <Link
            to="/statistic"
            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
          >
            View Statistics
          </Link>
        </header>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-96 items-center justify-center rounded-3xl bg-white shadow-sm">
            <Loader2 className="size-8 animate-spin text-cyan-600" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <aside className="space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black">Respondent Information</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Provide your basic information before submitting the checklist.
                </p>

                <div className="mt-6 space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Full Name</span>
                    <input
                      value={respondent.fullName ?? ""}
                      onChange={(event) => updateRespondent("fullName", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                      placeholder="Enter your full name"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Email</span>
                    <input
                      type="email"
                      value={respondent.email ?? ""}
                      onChange={(event) => updateRespondent("email", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                      placeholder="name@example.com"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Role</span>
                    <select
                      value={respondent.role ?? "Student"}
                      onChange={(event) => updateRespondent("role", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    >
                      {respondentRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Office</span>
                    <input
                      value={respondent.office ?? ""}
                      onChange={(event) => updateRespondent("office", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                      placeholder="Office or department"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Program</span>
                    <input
                      value={respondent.program ?? ""}
                      onChange={(event) => updateRespondent("program", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                      placeholder="Program or unit"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black">Survey Form</h2>
                <select
                  value={selectedFormCode}
                  onChange={(event) => setSelectedFormCode(event.target.value)}
                  className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                >
                  {forms.map((form) => (
                    <option key={form.id} value={form.code}>
                      {form.title}
                    </option>
                  ))}
                </select>

                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-700">Progress</p>
                  <p className="mt-1 text-3xl font-black text-slate-950">
                    {answeredCount}/{allItems.length || 0}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">answered checklist items</p>
                </div>
              </section>
            </aside>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              {isQuestionnaireLoading ? (
                <div className="flex min-h-96 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-cyan-600" />
                </div>
              ) : questionnaire ? (
                <div className="space-y-8">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-cyan-700">{questionnaire.code}</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight">{questionnaire.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{questionnaire.description}</p>
                    {questionnaire.instruction ? (
                      <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-7 text-cyan-900">
                        {questionnaire.instruction}
                      </div>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full min-w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="w-full px-4 py-3 font-black">Checklist Item</th>
                          {scale.map((option) => (
                            <th key={option.value} className="px-3 py-3 text-center font-black">
                              <span className="block text-base">{option.value}</span>
                              <span className="block whitespace-nowrap text-xs font-medium text-slate-500">{option.label}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {questionnaire.sections.map((section) => (
                          <FragmentSection
                            key={section.id}
                            sectionTitle={section.title}
                            items={section.items}
                            scale={scale}
                            answers={answers}
                            updateAnswer={updateAnswer}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <label className="block">
                      <span className="text-sm font-bold text-slate-700">
                        {questionnaire.signatureLabel || "Respondent Signature"}
                      </span>
                      <input
                        value={respondentSignature}
                        onChange={(event) => setRespondentSignature(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                        placeholder="Type your name as signature"
                      />
                    </label>

                    <label className="flex gap-3 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700">
                      <input
                        type="checkbox"
                        checked={voluntaryConsent}
                        onChange={(event) => setVoluntaryConsent(event.target.checked)}
                        className="mt-1 size-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      <span>
                        {questionnaire.voluntaryNote ||
                          "I voluntarily consent to submit this survey response for statistical evaluation."}
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={!isComplete || isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Submit Survey Response
                  </button>
                </div>
              ) : (
                <div className="flex min-h-96 flex-col items-center justify-center text-center">
                  <CheckCircle2 className="size-12 text-slate-300" />
                  <h2 className="mt-4 text-2xl font-black">No survey form available</h2>
                  <p className="mt-2 text-sm text-slate-500">Please check the backend survey forms endpoint.</p>
                </div>
              )}
            </section>
          </form>
        )}
      </div>
    </main>
  )
}

type FragmentSectionProps = {
  sectionTitle: string
  items: SurveyQuestionnaireForm["sections"][number]["items"]
  scale: ReturnType<typeof normalizeScale>
  answers: Record<string, LikertValue>
  updateAnswer: (itemId: string, rating: LikertValue) => void
}

function FragmentSection({ sectionTitle, items, scale, answers, updateAnswer }: FragmentSectionProps) {
  return (
    <>
      <tr className="bg-slate-950 text-white">
        <td colSpan={scale.length + 1} className="px-4 py-3 font-black">
          {sectionTitle}
        </td>
      </tr>
      {items.map((item, index) => (
        <tr key={item.id} className="border-t border-slate-200 align-top">
          <td className="px-4 py-4 text-slate-700">
            <span className="font-bold text-slate-950">{index + 1}. </span>
            {item.statement}
            {item.isRequired ? <span className="ml-1 text-red-500">*</span> : null}
          </td>
          {scale.map((option) => (
            <td key={option.value} className="px-3 py-4 text-center">
              <input
                type="radio"
                name={item.id}
                checked={answers[item.id] === option.value}
                onChange={() => updateAnswer(item.id, option.value)}
                className="size-5 border-slate-300 text-cyan-600 focus:ring-cyan-500"
                aria-label={`${item.statement}: ${option.label}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export default Survey
