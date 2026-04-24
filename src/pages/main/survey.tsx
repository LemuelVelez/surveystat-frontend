import { useEffect, useMemo, useState, type SyntheticEvent } from "react"
import { ArrowLeft, CheckCircle2, ChevronLeft, ClipboardList, Loader2, Send, UserRound } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import logoUrl from "@/assets/images/logo.svg"
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

function isFilled(value?: string | null) {
  return Boolean(value?.trim())
}

function hasRequiredRespondentInformation(respondent: CreateRespondentPayload) {
  return isFilled(respondent.fullName) && isFilled(respondent.email) && isFilled(String(respondent.role ?? ""))
}

function getInitialRespondent(): CreateRespondentPayload {
  return {
    fullName: "",
    email: "",
    role: "Student",
    office: "",
    program: "",
    consentGiven: true,
  }
}

export function Survey() {
  const [searchParams] = useSearchParams()
  const requestedFormCode = searchParams.get("form") ?? ""
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [questionnaire, setQuestionnaire] = useState<SurveyQuestionnaireForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, LikertValue>>({})
  const [respondent, setRespondent] = useState<CreateRespondentPayload>(getInitialRespondent)
  const [includeRespondentInformation, setIncludeRespondentInformation] = useState(true)
  const [respondentSignature, setRespondentSignature] = useState("")
  const [voluntaryConsent, setVoluntaryConsent] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
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
  const selectedForm = useMemo(
    () => forms.find((form) => form.code === selectedFormCode) ?? null,
    [forms, selectedFormCode],
  )
  const respondentInformationRequired = questionnaire?.respondentInformationRequired ?? selectedForm?.respondentInformationRequired ?? true
  const respondentInformationComplete = hasRequiredRespondentInformation(respondent)
  const requiredChecklistComplete = requiredItems.every((item) => answers[item.id])
  const isComplete = requiredChecklistComplete && voluntaryConsent && (!respondentInformationRequired || respondentInformationComplete)

  useEffect(() => {
    let isMounted = true

    async function loadForms() {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const surveyForms = await surveyStatService.listSurveyForms(true)

        if (!isMounted) return

        setForms(surveyForms)
        setSelectedFormCode(
          surveyForms.find((form) => form.code === requestedFormCode)?.code ?? surveyForms[0]?.code ?? "",
        )
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
  }, [requestedFormCode])

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
        setRespondentSignature("")
        setIncludeRespondentInformation(selectedQuestionnaire.respondentInformationRequired)
        setCurrentStep(1)
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

  function handleContinueToChecklist() {
    if (!questionnaire) {
      toast.error("Please select a survey first.")
      return
    }

    if (respondentInformationRequired && !respondentInformationComplete) {
      toast.error("Please complete the required respondent information.")
      return
    }

    setCurrentStep(2)
  }

  function getRespondentPayload() {
    if (!respondentInformationRequired && !includeRespondentInformation) {
      return null
    }

    return respondent
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!questionnaire) {
      toast.error("Please select a survey first.")
      return
    }

    if (respondentInformationRequired && !respondentInformationComplete) {
      toast.error("Please complete the required respondent information.")
      setCurrentStep(1)
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
        respondent: getRespondentPayload(),
        respondentSignature,
        voluntaryConsent,
        answers: payloadAnswers,
      })

      toast.success("Survey response submitted successfully.")
      setAnswers({})
      setRespondent(getInitialRespondent())
      setRespondentSignature("")
      setVoluntaryConsent(false)
      setCurrentStep(1)
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
              <span className="flex size-14 items-center justify-center rounded-2xl bg-white p-2">
                <img src={logoUrl} alt="SurveyStat logo" className="size-full object-contain" />
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">Survey Checklist</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Complete Step 1 for respondent details, then proceed to Step 2 to place your checks for each survey item.
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

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <StepCard step={1} title="Respondent Information" isActive={currentStep === 1} isComplete={!respondentInformationRequired || respondentInformationComplete} />
          <StepCard step={2} title="Checklist Evaluation" isActive={currentStep === 2} isComplete={requiredChecklistComplete && voluntaryConsent} />
        </div>

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
          <form onSubmit={handleSubmit} className="space-y-6">
            {currentStep === 1 ? (
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-cyan-700">Step 1</p>
                    <h2 className="mt-2 text-2xl font-black">Respondent Information</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                      Select an active survey and provide the respondent details required for that survey.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                    {answeredCount}/{allItems.length || 0} answered
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {forms.map((form) => {
                    const isSelected = selectedFormCode === form.code

                    return (
                      <button
                        key={form.id}
                        type="button"
                        onClick={() => setSelectedFormCode(form.code)}
                        className={`rounded-2xl border p-5 text-left transition ${
                          isSelected
                            ? "border-cyan-500 bg-cyan-50 shadow-lg shadow-cyan-100"
                            : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
                        }`}
                      >
                        <span className="flex items-start justify-between gap-4">
                          <span>
                            <span className="text-base font-black text-slate-950">{form.title}</span>
                            <span className="mt-2 line-clamp-3 block text-sm leading-6 text-slate-500">{form.description}</span>
                          </span>
                          {isSelected ? <CheckCircle2 className="size-5 shrink-0 text-cyan-600" /> : null}
                        </span>
                        <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                          {form.respondentInformationRequired ? "Respondent info required" : "Respondent info optional"}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                        <UserRound className="size-5" />
                      </span>
                      <div>
                        <h3 className="font-black text-slate-950">Respondent Details</h3>
                        <p className="text-sm text-slate-500">
                          {respondentInformationRequired ? "Required by this survey" : "Optional for this survey"}
                        </p>
                      </div>
                    </div>

                    {!respondentInformationRequired ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={includeRespondentInformation}
                        onClick={() => setIncludeRespondentInformation((current) => !current)}
                        className={`inline-flex items-center gap-3 rounded-full px-3 py-2 text-sm font-bold transition ${
                          includeRespondentInformation ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        <span
                          className={`size-5 rounded-full bg-white transition ${includeRespondentInformation ? "translate-x-1" : ""}`}
                        />
                        {includeRespondentInformation ? "Information On" : "Information Off"}
                      </button>
                    ) : null}
                  </div>

                  {(respondentInformationRequired || includeRespondentInformation) ? (
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-bold text-slate-700">
                          Full Name {respondentInformationRequired ? <span className="text-red-500">*</span> : null}
                        </span>
                        <input
                          value={respondent.fullName ?? ""}
                          onChange={(event) => updateRespondent("fullName", event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                          placeholder="Enter your full name"
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-bold text-slate-700">
                          Email {respondentInformationRequired ? <span className="text-red-500">*</span> : null}
                        </span>
                        <input
                          type="email"
                          value={respondent.email ?? ""}
                          onChange={(event) => updateRespondent("email", event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                          placeholder="name@example.com"
                        />
                      </label>

                      <div className="lg:col-span-2">
                        <span className="text-sm font-bold text-slate-700">
                          Role {respondentInformationRequired ? <span className="text-red-500">*</span> : null}
                        </span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {respondentRoles.map((role) => {
                            const isSelected = respondent.role === role

                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => updateRespondent("role", role)}
                                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                                  isSelected ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {role}
                              </button>
                            )
                          })}
                        </div>
                      </div>

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
                  ) : null}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={handleContinueToChecklist}
                    disabled={isQuestionnaireLoading || !questionnaire || (respondentInformationRequired && !respondentInformationComplete)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isQuestionnaireLoading ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
                    Continue to Step 2
                  </button>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                {isQuestionnaireLoading ? (
                  <div className="flex min-h-96 items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-cyan-600" />
                  </div>
                ) : questionnaire ? (
                  <div className="space-y-8">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide text-cyan-700">Step 2 · {questionnaire.code}</p>
                        <h2 className="mt-2 text-3xl font-black tracking-tight">{questionnaire.title}</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-600">{questionnaire.description}</p>
                        {questionnaire.instruction ? (
                          <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-7 text-cyan-900">
                            {questionnaire.instruction}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        <ChevronLeft className="size-4" />
                        Back to Step 1
                      </button>
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

                      <button
                        type="button"
                        role="switch"
                        aria-checked={voluntaryConsent}
                        onClick={() => setVoluntaryConsent((current) => !current)}
                        className={`flex w-full gap-3 rounded-2xl p-4 text-left text-sm leading-6 transition ${
                          voluntaryConsent ? "bg-cyan-50 text-cyan-950 ring-2 ring-cyan-200" : "bg-white text-slate-700 ring-1 ring-slate-200"
                        }`}
                      >
                        <span
                          className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                            voluntaryConsent ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300 bg-white"
                          }`}
                        >
                          {voluntaryConsent ? <CheckCircle2 className="size-4" /> : null}
                        </span>
                        <span>
                          {questionnaire.voluntaryNote ||
                            "I voluntarily consent to submit this survey response for statistical evaluation."}
                        </span>
                      </button>
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
            )}
          </form>
        )}
      </div>
    </main>
  )
}

type StepCardProps = {
  step: 1 | 2
  title: string
  isActive: boolean
  isComplete: boolean
}

function StepCard({ step, title, isActive, isComplete }: StepCardProps) {
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        isActive ? "border-cyan-400 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex size-9 items-center justify-center rounded-xl text-sm font-black ${
            isComplete ? "bg-cyan-600 text-white" : isActive ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {isComplete ? <CheckCircle2 className="size-5" /> : step}
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Step {step}</p>
          <p className="font-black text-slate-950">{title}</p>
        </div>
      </div>
    </div>
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
          {scale.map((option) => {
            const isSelected = answers[item.id] === option.value

            return (
              <td key={option.value} className="px-3 py-4 text-center">
                <button
                  type="button"
                  onClick={() => updateAnswer(item.id, option.value)}
                  className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm font-black transition ${
                    isSelected ? "bg-cyan-600 text-white shadow-lg shadow-cyan-100" : "bg-slate-100 text-slate-700 hover:bg-cyan-100 hover:text-cyan-700"
                  }`}
                  aria-label={`${item.statement}: ${option.label}`}
                  aria-pressed={isSelected}
                >
                  {isSelected ? <CheckCircle2 className="size-5" /> : option.value}
                </button>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

export default Survey