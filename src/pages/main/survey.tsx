import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from "react"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Eraser,
  ImagePlus,
  Loader2,
  PenLine,
  ScanLine,
  Send,
  Upload,
  Camera,
  UserRound,
  X,
} from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import logoUrl from "@/assets/images/logo.svg"
import {
  SurveyStatApiError,
  surveyStatService,
  type CreateRespondentPayload,
  type LikertValue,
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

const respondentRoles = ["Student", "Faculty", "QA Personnel", "Administrator"] as const

type SignatureMode = "draw" | "scan"

const drawnSignatureFilename = "drawn-respondent-signature.png"

type SurveyDraft = {
  answers: Record<string, LikertValue>
  respondent: CreateRespondentPayload
  includeRespondentInformation: boolean
  respondentSignatureImage: string
  respondentSignatureFileName: string
  signatureMode: SignatureMode
  voluntaryConsent: boolean
  isSubmitted: boolean
}

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

function getInitialDraft(includeRespondentInformation = true): SurveyDraft {
  return {
    answers: {},
    respondent: getInitialRespondent(),
    includeRespondentInformation,
    respondentSignatureImage: "",
    respondentSignatureFileName: "",
    signatureMode: "draw",
    voluntaryConsent: false,
    isSubmitted: false,
  }
}

function getRequestedFormCodes(formsParam: string, formParam: string) {
  const source = formsParam || formParam

  return source
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
}

function getSurveyShareUrl(formCodes: string[]) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const codes = formCodes.map((code) => code.trim()).filter(Boolean)

  if (codes.length === 0) {
    return `${origin}/survey`
  }

  return `${origin}/survey?forms=${encodeURIComponent(codes.join(","))}`
}

export function Survey() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedFormsParam = searchParams.get("forms") ?? ""
  const requestedFormParam = searchParams.get("form") ?? ""
  const requestedFormCodes = useMemo(
    () => getRequestedFormCodes(requestedFormsParam, requestedFormParam),
    [requestedFormsParam, requestedFormParam],
  )
  const [selectedFormCodes, setSelectedFormCodes] = useState<string[]>([])
  const [questionnaires, setQuestionnaires] = useState<SurveyQuestionnaireForm[]>([])
  const [drafts, setDrafts] = useState<Record<string, SurveyDraft>>({})
  const [currentSurveyIndex, setCurrentSurveyIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isQuestionnaireLoading, setIsQuestionnaireLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [showStickyScale, setShowStickyScale] = useState(false)
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false)
  const [missingRequiredItemIds, setMissingRequiredItemIds] = useState<string[]>([])
  const checklistTableRef = useRef<HTMLDivElement>(null)
  const checklistScaleHeaderRef = useRef<HTMLTableSectionElement>(null)
  const checklistItemRefs = useRef<Record<string, HTMLTableRowElement | HTMLDivElement | null>>({})

  useEffect(() => {
    let isMounted = true

    async function loadForms() {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const surveyForms = await surveyStatService.listSurveyForms(true)

        if (!isMounted) return

        const availableCodes = new Set(surveyForms.map((form) => form.code))
        const codesFromUrl = requestedFormCodes.filter((code) => availableCodes.has(code))
        const nextCodes = codesFromUrl.length > 0 ? codesFromUrl : surveyForms[0]?.code ? [surveyForms[0].code] : []

        setSelectedFormCodes(nextCodes)
        setCurrentSurveyIndex(0)
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
  }, [requestedFormCodes])

  useEffect(() => {
    if (selectedFormCodes.length === 0) {
      setQuestionnaires([])
      setDrafts({})
      return
    }

    let isMounted = true

    async function loadQuestionnaires() {
      setIsQuestionnaireLoading(true)
      setErrorMessage("")

      try {
        const selectedQuestionnaires = await Promise.all(
          selectedFormCodes.map((formCode) => surveyStatService.getQuestionnaireByFormCode(formCode)),
        )

        if (!isMounted) return

        setQuestionnaires(selectedQuestionnaires)
        setDrafts((current) => {
          const nextDrafts: Record<string, SurveyDraft> = {}

          selectedQuestionnaires.forEach((questionnaire) => {
            nextDrafts[questionnaire.code] =
              current[questionnaire.code] ?? getInitialDraft(questionnaire.respondentInformationRequired)
          })

          return nextDrafts
        })
        setCurrentSurveyIndex(0)
      } catch (error) {
        if (!isMounted) return
        setQuestionnaires([])
        setErrorMessage(getErrorMessage(error))
      } finally {
        if (isMounted) {
          setIsQuestionnaireLoading(false)
        }
      }
    }

    loadQuestionnaires()

    return () => {
      isMounted = false
    }
  }, [selectedFormCodes])

  const currentQuestionnaire = questionnaires[currentSurveyIndex] ?? null
  const currentCode = currentQuestionnaire?.code ?? ""
  const currentDraft = currentCode ? drafts[currentCode] ?? getInitialDraft(currentQuestionnaire?.respondentInformationRequired) : getInitialDraft()
  const allItems = useMemo(
    () => currentQuestionnaire?.sections.flatMap((section) => section.items) ?? [],
    [currentQuestionnaire],
  )
  const requiredItems = useMemo(() => allItems.filter((item) => item.isRequired), [allItems])
  const answeredCount = getAnsweredCount(currentDraft.answers)
  const scale = normalizeScale(currentQuestionnaire?.scale)
  const respondentInformationRequired = currentQuestionnaire?.respondentInformationRequired ?? true
  const respondentInformationComplete = hasRequiredRespondentInformation(currentDraft.respondent)
  const completedCount = questionnaires.filter((questionnaire) => drafts[questionnaire.code]?.isSubmitted).length
  const missingRequiredItemIdSet = useMemo(() => new Set(missingRequiredItemIds), [missingRequiredItemIds])

  useEffect(() => {
    if (!currentQuestionnaire) {
      setShowStickyScale(false)
      return
    }

    let animationFrameId = 0

    function updateStickyScaleVisibility() {
      window.cancelAnimationFrame(animationFrameId)

      animationFrameId = window.requestAnimationFrame(() => {
        const checklistTable = checklistTableRef.current
        const scaleHeader = checklistScaleHeaderRef.current

        if (!checklistTable || !scaleHeader) {
          setShowStickyScale(false)
          return
        }

        const checklistRect = checklistTable.getBoundingClientRect()
        const scaleHeaderRect = scaleHeader.getBoundingClientRect()
        const isOriginalScaleHidden = scaleHeaderRect.bottom <= 0
        const isChecklistStillVisible = checklistRect.top < window.innerHeight && checklistRect.bottom > 72

        setShowStickyScale(isOriginalScaleHidden && isChecklistStillVisible)
      })
    }

    updateStickyScaleVisibility()
    window.addEventListener("scroll", updateStickyScaleVisibility, { passive: true })
    window.addEventListener("resize", updateStickyScaleVisibility)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener("scroll", updateStickyScaleVisibility)
      window.removeEventListener("resize", updateStickyScaleVisibility)
    }
  }, [currentQuestionnaire, currentCode])

  useEffect(() => {
    setIsChecklistDialogOpen(false)
    setMissingRequiredItemIds([])
    checklistItemRefs.current = {}
  }, [currentCode])

  useEffect(() => {
    const firstMissingItemId = missingRequiredItemIds[0]

    if (!firstMissingItemId) return

    const timeoutId = window.setTimeout(() => {
      scrollToChecklistItem(firstMissingItemId)
    }, isChecklistDialogOpen ? 120 : 0)

    return () => window.clearTimeout(timeoutId)
  }, [isChecklistDialogOpen, missingRequiredItemIds])

  function updateCurrentDraft(updater: (current: SurveyDraft) => SurveyDraft) {
    if (!currentQuestionnaire) return

    setDrafts((current) => {
      const existingDraft = current[currentQuestionnaire.code] ?? getInitialDraft(currentQuestionnaire.respondentInformationRequired)

      return {
        ...current,
        [currentQuestionnaire.code]: updater(existingDraft),
      }
    })
  }

  function updateRespondent<K extends keyof CreateRespondentPayload>(key: K, value: CreateRespondentPayload[K]) {
    updateCurrentDraft((current) => ({
      ...current,
      respondent: {
        ...current.respondent,
        [key]: value,
      },
    }))
  }

  function updateAnswer(itemId: string, rating: LikertValue) {
    setMissingRequiredItemIds((current) => current.filter((missingItemId) => missingItemId !== itemId))

    updateCurrentDraft((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [itemId]: rating,
      },
      isSubmitted: false,
    }))
  }

  function setChecklistItemRef(itemId: string, element: HTMLTableRowElement | HTMLDivElement | null) {
    if (element) {
      checklistItemRefs.current[itemId] = element
      return
    }

    delete checklistItemRefs.current[itemId]
  }

  function scrollToChecklistItem(itemId: string) {
    const checklistItem = checklistItemRefs.current[itemId]

    if (!checklistItem) return

    checklistItem.scrollIntoView({ behavior: "smooth", block: "center" })
    checklistItem.focus({ preventScroll: true })
  }

  function highlightMissingRequiredItems(missingItems: SurveyQuestionnaireForm["sections"][number]["items"]) {
    const missingItemIds = missingItems.map((item) => item.id)

    setMissingRequiredItemIds(missingItemIds)

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      setIsChecklistDialogOpen(true)
    }

    toast.error("Please answer the highlighted required checklist item.")
  }

  function setIncludeRespondentInformation(value: boolean) {
    updateCurrentDraft((current) => ({
      ...current,
      includeRespondentInformation: value,
      isSubmitted: false,
    }))
  }


  function setRespondentSignatureImage(value: string, filename = "respondent-signature.png") {
    updateCurrentDraft((current) => ({
      ...current,
      respondentSignatureImage: value,
      respondentSignatureFileName: value ? filename : "",
      isSubmitted: false,
    }))
  }

  function setSignatureMode(value: SignatureMode) {
    updateCurrentDraft((current) => ({
      ...current,
      signatureMode: value,
      isSubmitted: false,
    }))
  }

  function setVoluntaryConsent(value: boolean) {
    updateCurrentDraft((current) => ({
      ...current,
      voluntaryConsent: value,
      isSubmitted: false,
    }))
  }

  function getRespondentPayload() {
    if (!respondentInformationRequired && !currentDraft.includeRespondentInformation) {
      return null
    }

    return currentDraft.respondent
  }

  async function copyCurrentSurveyShareLink() {
    try {
      await navigator.clipboard.writeText(getSurveyShareUrl(selectedFormCodes))
      toast.success("Survey share link copied.")
    } catch {
      toast.error("Unable to copy survey share link.")
    }
  }

  async function handleSubmitCurrentSurvey(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!currentQuestionnaire) {
      toast.error("Please select a survey first.")
      return
    }

    const missingRequiredItems = requiredItems.filter((item) => !currentDraft.answers[item.id])

    if (missingRequiredItems.length > 0) {
      highlightMissingRequiredItems(missingRequiredItems)
      return
    }

    setMissingRequiredItemIds([])

    if (respondentInformationRequired && !respondentInformationComplete) {
      toast.error("Please complete the required respondent information.")
      return
    }

    if (!currentDraft.voluntaryConsent) {
      toast.error("Please confirm voluntary consent before submitting.")
      return
    }

    if (!currentDraft.respondentSignatureImage) {
      toast.error("Please provide the required respondent signature.")
      return
    }

    const payloadAnswers: SubmitSurveyAnswerPayload[] = allItems
      .filter((item) => currentDraft.answers[item.id])
      .map((item) => ({
        itemId: item.id,
        rating: currentDraft.answers[item.id],
      }))

    setIsSubmitting(true)

    try {
      await surveyStatService.submitSurveyResponse({
        formId: currentQuestionnaire.id,
        formCode: currentQuestionnaire.code,
        respondent: getRespondentPayload(),
        respondentSignature: null,
        respondentSignatureImage: currentDraft.respondentSignatureImage || null,
        respondentSignatureFileName: currentDraft.respondentSignatureFileName || null,
        voluntaryConsent: currentDraft.voluntaryConsent,
        answers: payloadAnswers,
      })

      updateCurrentDraft((current) => ({
        ...current,
        isSubmitted: true,
      }))

      if (currentSurveyIndex < questionnaires.length - 1) {
        toast.success(`Survey ${currentSurveyIndex + 1} submitted. Continue to Survey ${currentSurveyIndex + 2}.`)
        setCurrentSurveyIndex((current) => current + 1)
      } else {
        toast.success("Survey response series submitted successfully.")
        navigate("/survey/thank-you", { replace: true })
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <header className="mb-6 flex flex-col gap-5 rounded-2xl bg-slate-950/95 p-4 text-white shadow-xl shadow-slate-300/40 backdrop-blur sm:mb-8 sm:rounded-3xl sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link to="/" className="mb-5 inline-flex max-w-xs items-center gap-2 truncate text-sm font-semibold text-cyan-200 hover:text-cyan-100 sm:max-w-none">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white p-2 sm:size-14">
                <img src={logoUrl} alt="SurveyStat logo" className="size-full object-contain" />
              </span>
              <div className="min-w-0">
                <h1 className="max-w-xs truncate text-2xl font-black tracking-tight sm:max-w-none sm:text-3xl md:text-4xl">Survey Checklist</h1>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300 wrap-anywhere sm:max-w-3xl">
                  Complete Survey 1, Survey 2, and the next surveys in order. Each survey is submitted before moving forward.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="max-w-xs truncate rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 sm:max-w-none">
              {completedCount}/{questionnaires.length || 0} surveys submitted
            </div>
            <button
              type="button"
              onClick={copyCurrentSurveyShareLink}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10 sm:w-auto"
            >
              <Copy className="size-4" />
              Share Survey
            </button>
            <Link
              to="/statistic"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100 sm:w-auto"
            >
              View Statistics
            </Link>
          </div>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {questionnaires.length > 0 ? (
            questionnaires.map((questionnaire, index) => (
              <SurveyStepCard
                key={questionnaire.id}
                step={index + 1}
                title={questionnaire.title}
                isActive={currentSurveyIndex === index}
                isComplete={Boolean(drafts[questionnaire.code]?.isSubmitted)}
                onClick={() => setCurrentSurveyIndex(index)}
              />
            ))
          ) : (
            <>
              <SurveyStepCard step={1} title="Survey 1" isActive isComplete={false} onClick={() => undefined} />
              <SurveyStepCard step={2} title="Survey 2" isActive={false} isComplete={false} onClick={() => undefined} />
            </>
          )}
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
          <form onSubmit={handleSubmitCurrentSurvey} className="space-y-6">
            <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
              {isQuestionnaireLoading ? (
                <div className="flex min-h-96 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-cyan-600" />
                </div>
              ) : currentQuestionnaire ? (
                <div className="space-y-8">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="max-w-xs truncate text-sm font-bold uppercase tracking-wide text-cyan-700 sm:max-w-none">
                        Survey {currentSurveyIndex + 1} of {questionnaires.length} · {currentQuestionnaire.code}
                      </p>
                      <h2 className="mt-2 max-w-xs text-2xl font-black tracking-tight wrap-anywhere sm:max-w-none sm:text-3xl">{currentQuestionnaire.title}</h2>
                      <p className="mt-3 max-w-xs text-sm leading-7 text-slate-600 wrap-anywhere sm:max-w-3xl">{currentQuestionnaire.description}</p>
                      {currentQuestionnaire.instruction ? (
                        <div className="mt-4 max-w-xs rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-7 text-cyan-900 wrap-anywhere sm:max-w-none">
                          {currentQuestionnaire.instruction}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <button
                        type="button"
                        onClick={() => setCurrentSurveyIndex((current) => Math.max(current - 1, 0))}
                        disabled={currentSurveyIndex === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <ChevronLeft className="size-4" />
                        Previous Survey
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentSurveyIndex((current) => Math.min(current + 1, questionnaires.length - 1))}
                        disabled={currentSurveyIndex === questionnaires.length - 1}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Next Survey
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                          <UserRound className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="max-w-xs truncate font-black text-slate-950 sm:max-w-none">Respondent Details</h3>
                          <p className="max-w-xs truncate text-sm text-slate-500 sm:max-w-none">
                            {respondentInformationRequired ? "Required by this survey" : "Optional for this survey"}
                          </p>
                        </div>
                      </div>

                      {!respondentInformationRequired ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={currentDraft.includeRespondentInformation}
                          onClick={() => setIncludeRespondentInformation(!currentDraft.includeRespondentInformation)}
                          className={`inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-full px-3 py-2 text-sm font-bold transition sm:w-auto sm:max-w-none ${
                            currentDraft.includeRespondentInformation ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          <span
                            className={`size-5 rounded-full bg-white transition ${
                              currentDraft.includeRespondentInformation ? "translate-x-1" : ""
                            }`}
                          />
                          {currentDraft.includeRespondentInformation ? "Information On" : "Information Off"}
                        </button>
                      ) : null}
                    </div>

                    {(respondentInformationRequired || currentDraft.includeRespondentInformation) ? (
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-bold text-slate-700">
                            Full Name {respondentInformationRequired ? <span className="text-red-500">*</span> : null}
                          </span>
                          <input
                            value={currentDraft.respondent.fullName ?? ""}
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
                            value={currentDraft.respondent.email ?? ""}
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
                              const isSelected = currentDraft.respondent.role === role

                              return (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => updateRespondent("role", role)}
                                  className={`max-w-xs truncate rounded-full px-4 py-2 text-sm font-bold transition sm:max-w-none ${
                                    isSelected
                                      ? "bg-slate-950 text-white"
                                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
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
                            value={currentDraft.respondent.office ?? ""}
                            onChange={(event) => updateRespondent("office", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                            placeholder="Office or department"
                          />
                        </label>

                        <label className="block">
                          <span className="text-sm font-bold text-slate-700">Program</span>
                          <input
                            value={currentDraft.respondent.program ?? ""}
                            onChange={(event) => updateRespondent("program", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                            placeholder="Program or unit"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white">
                    <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      <div className="min-w-0">
                        <h3 className="max-w-xs truncate text-xl font-black text-slate-950 sm:max-w-none">Checklist Evaluation</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {answeredCount}/{allItems.length || 0} answered
                        </p>
                      </div>
                      <div className="inline-flex max-w-xs items-center gap-2 truncate rounded-full bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-700 sm:max-w-none">
                        <ClipboardList className="size-4" />
                        Survey {currentSurveyIndex + 1}
                      </div>
                    </div>

                    <StickySurveyScale scale={scale} isVisible={showStickyScale} />

                    <div className="border-t border-slate-100 p-4 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setIsChecklistDialogOpen(true)}
                        className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-600"
                      >
                        <ClipboardList className="size-4" />
                        Click Me to Answer
                      </button>
                      <div className="mt-3 grid max-w-xs gap-2">
                        {scale.map((option) => (
                          <span
                            key={option.value}
                            className="inline-flex min-w-0 items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            <span className="text-base font-black text-slate-950">{option.value}</span>
                            <span className="truncate">{option.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div ref={checklistTableRef} className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-full border-collapse text-left text-sm">
                        <thead ref={checklistScaleHeaderRef} className="bg-slate-100 text-slate-700">
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
                          {currentQuestionnaire.sections.map((section) => (
                            <FragmentSection
                              key={section.id}
                              sectionTitle={section.title}
                              items={section.items}
                              scale={scale}
                              answers={currentDraft.answers}
                              updateAnswer={updateAnswer}
                              missingRequiredItemIds={missingRequiredItemIdSet}
                              setChecklistItemRef={setChecklistItemRef}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {isChecklistDialogOpen ? (
                    <MobileChecklistDialog
                      sections={currentQuestionnaire.sections}
                      scale={scale}
                      answers={currentDraft.answers}
                      updateAnswer={updateAnswer}
                      missingRequiredItemIds={missingRequiredItemIdSet}
                      setChecklistItemRef={setChecklistItemRef}
                      onClose={() => setIsChecklistDialogOpen(false)}
                    />
                  ) : null}

                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <SignatureCapture
                      label={currentQuestionnaire.signatureLabel || "Respondent Signature"}
                      required
                      mode={currentDraft.signatureMode}
                      imageSignature={currentDraft.respondentSignatureImage}
                      imageFilename={currentDraft.respondentSignatureFileName}
                      onModeChange={setSignatureMode}
                      onImageSignatureChange={setRespondentSignatureImage}
                    />

                    <button
                      type="button"
                      role="switch"
                      aria-checked={currentDraft.voluntaryConsent}
                      onClick={() => setVoluntaryConsent(!currentDraft.voluntaryConsent)}
                      className={`flex w-full gap-3 rounded-2xl p-4 text-left text-sm leading-6 transition ${
                        currentDraft.voluntaryConsent
                          ? "bg-cyan-50 text-cyan-950 ring-2 ring-cyan-200"
                          : "bg-white text-slate-700 ring-1 ring-slate-200"
                      }`}
                    >
                      <span
                        className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          currentDraft.voluntaryConsent ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300 bg-white"
                        }`}
                      >
                        {currentDraft.voluntaryConsent ? <CheckCircle2 className="size-4" /> : null}
                      </span>
                      <span className="max-w-xs wrap-anywhere sm:max-w-none">
                        {currentQuestionnaire.voluntaryNote ||
                          "I voluntarily consent to submit this survey response for statistical evaluation."}
                      </span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-6"
                  >
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {currentSurveyIndex < questionnaires.length - 1 ? "Submit Survey and Continue" : "Submit Final Survey"}
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

type SignatureCaptureProps = {
  label: string
  required: boolean
  mode: SignatureMode
  imageSignature: string
  imageFilename: string
  onModeChange: (mode: SignatureMode) => void
  onImageSignatureChange: (value: string, filename?: string) => void
}

function SignatureCapture({
  label,
  required,
  mode,
  imageSignature,
  imageFilename,
  onModeChange,
  onImageSignatureChange,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (mode !== "draw") return

    const canvas = canvasRef.current
    if (!canvas) return

    let animationFrameId = 0

    function initializeCanvas() {
      const canvasElement = canvasRef.current
      if (!canvasElement) return

      const context = canvasElement.getContext("2d")
      if (!context) return

      const pixelRatio = window.devicePixelRatio || 1
      const rect = canvasElement.getBoundingClientRect()
      const width = Math.max(Math.floor(rect.width), 1)
      const height = Math.max(Math.floor(rect.height), 1)
      const shouldRestoreDrawnSignature = Boolean(imageSignature && imageFilename === drawnSignatureFilename)

      canvasElement.width = Math.round(width * pixelRatio)
      canvasElement.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, width, height)
      context.lineWidth = 3
      context.lineCap = "round"
      context.lineJoin = "round"
      context.strokeStyle = "#0f172a"

      if (!shouldRestoreDrawnSignature) return

      const signatureImage = new Image()
      signatureImage.onload = () => {
        context.drawImage(signatureImage, 0, 0, width, height)
        context.lineWidth = 3
        context.lineCap = "round"
        context.lineJoin = "round"
        context.strokeStyle = "#0f172a"
      }
      signatureImage.src = imageSignature
    }

    function scheduleInitializeCanvas() {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(initializeCanvas)
    }

    scheduleInitializeCanvas()

    const resizeObserver = new ResizeObserver(scheduleInitializeCanvas)
    resizeObserver.observe(canvas)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
    }
  }, [imageFilename, imageSignature, mode])

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current

    if (!canvas) {
      return { x: 0, y: 0 }
    }

    const rect = canvas.getBoundingClientRect()

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function handleDrawStart(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault()

    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")

    if (!canvas || !context) return

    const point = getCanvasPoint(event)
    isDrawingRef.current = true
    canvas.setPointerCapture(event.pointerId)
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  function handleDrawMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return

    event.preventDefault()

    const context = canvasRef.current?.getContext("2d")
    if (!context) return

    const point = getCanvasPoint(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function handleDrawEnd(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current

    if (!canvas || !isDrawingRef.current) return

    event.preventDefault()
    isDrawingRef.current = false

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }

    onImageSignatureChange(canvas.toDataURL("image/png"), drawnSignatureFilename)
  }

  function clearDrawnSignature() {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")

    if (!canvas || !context) return

    const rect = canvas.getBoundingClientRect()
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, rect.width, rect.height)
    context.beginPath()
    onImageSignatureChange("", "")
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file for the scanned signature.")
      event.target.value = ""
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      onImageSignatureChange(String(reader.result ?? ""), file.name)
    }

    reader.onerror = () => {
      toast.error("Unable to read the selected signature image.")
    }

    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <span className="block max-w-xs truncate text-sm font-black text-slate-700 sm:max-w-none">
            {label} {required ? <span className="text-red-500">*</span> : null}
          </span>
          <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500 wrap-anywhere sm:max-w-none">
            {required
              ? "Required: draw your signature or scan/capture a signature image using your camera."
              : "Optional: draw your signature or scan/capture a signature image using your camera."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <SignatureModeButton
            label="Draw"
            icon={<PenLine className="size-4" />}
            isActive={mode === "draw"}
            onClick={() => onModeChange("draw")}
          />
          <SignatureModeButton
            label="Scan"
            icon={<ScanLine className="size-4" />}
            isActive={mode === "scan"}
            onClick={() => onModeChange("scan")}
          />
        </div>
      </div>

      {mode === "draw" ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-2 sm:p-3">
            <canvas
              ref={canvasRef}
              className="h-40 w-full max-w-full touch-none select-none rounded-xl bg-white shadow-inner sm:h-48"
              onPointerDown={handleDrawStart}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawEnd}
              onPointerCancel={handleDrawEnd}
              onPointerLeave={handleDrawEnd}
              aria-label="Draw respondent signature"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-xs text-xs font-semibold text-slate-500 wrap-anywhere sm:max-w-none">Draw inside the white box. The image will be uploaded to Amazon S3 on submit.</p>
            <button
              type="button"
              onClick={clearDrawnSignature}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
            >
              <Eraser className="size-4" />
              Clear Drawing
            </button>
          </div>
        </div>
      ) : null}

      {mode === "scan" ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 sm:p-4">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                <ImagePlus className="size-5" />
              </span>
              <div>
                <p className="font-black text-slate-950">Scan or capture signature</p>
                <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500 wrap-anywhere sm:max-w-none">
                  Use your camera to capture a paper signature or choose an existing image from your device.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-700 sm:w-auto sm:max-w-none"
              >
                <Camera className="size-4" />
                Capture with Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 sm:w-auto sm:max-w-none"
              >
                <Upload className="size-4" />
                Choose Image
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {required && !imageSignature ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          Respondent signature is required before submitting.
        </p>
      ) : null}

      {imageSignature ? (
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
          <p className="max-w-full truncate text-xs font-black uppercase tracking-wide text-cyan-700">
            Signature image ready {imageFilename ? `· ${imageFilename}` : ""}
          </p>
          <img src={imageSignature} alt="Respondent signature preview" className="mt-3 h-auto max-h-40 w-full max-w-full rounded-xl border border-cyan-200 bg-white object-contain p-3" />
        </div>
      ) : null}
    </div>
  )
}

type SignatureModeButtonProps = {
  label: string
  icon: ReactNode
  isActive: boolean
  onClick: () => void
}

function SignatureModeButton({ label, icon, isActive, onClick }: SignatureModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${
        isActive ? "bg-cyan-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

type SurveyStepCardProps = {
  step: number
  title: string
  isActive: boolean
  isComplete: boolean
  onClick: () => void
}

function SurveyStepCard({ step, title, isActive, isComplete, onClick }: SurveyStepCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full max-w-xs rounded-2xl border p-4 text-left transition sm:max-w-none ${
        isActive ? "border-cyan-400 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex size-9 items-center justify-center rounded-xl text-sm font-black ${
            isComplete ? "bg-cyan-600 text-white" : isActive ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {isComplete ? <CheckCircle2 className="size-5" /> : step}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Survey {step}</p>
          <p className="line-clamp-2 font-black text-slate-950 wrap-anywhere">{title}</p>
        </div>
      </div>
    </button>
  )
}

type StickySurveyScaleProps = {
  scale: ReturnType<typeof normalizeScale>
  isVisible: boolean
}

function StickySurveyScale({ scale, isVisible }: StickySurveyScaleProps) {
  if (!isVisible) {
    return null
  }

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-50 px-3 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-b-2xl border border-slate-200 bg-white px-5 py-3 shadow-lg shadow-slate-300/40">
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap sm:justify-end">
            {scale.map((option) => (
              <span
                key={option.value}
                className="inline-flex min-w-36 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-700"
              >
                <span className="text-base font-black text-slate-950">{option.value}</span>
                <span className="whitespace-nowrap">{option.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}


type MobileChecklistDialogProps = {
  sections: SurveyQuestionnaireForm["sections"]
  scale: ReturnType<typeof normalizeScale>
  answers: Record<string, LikertValue>
  updateAnswer: (itemId: string, rating: LikertValue) => void
  missingRequiredItemIds: Set<string>
  setChecklistItemRef: (itemId: string, element: HTMLDivElement | HTMLTableRowElement | null) => void
  onClose: () => void
}

function MobileChecklistDialog({
  sections,
  scale,
  answers,
  updateAnswer,
  missingRequiredItemIds,
  setChecklistItemRef,
  onClose,
}: MobileChecklistDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-4 backdrop-blur-sm sm:hidden"
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[calc(100svh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/30">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
          <div className="min-w-0">
            <p className="max-w-xs truncate text-xs font-black uppercase tracking-wide text-cyan-700">Checklist Evaluation</p>
            <h3 className="mt-1 max-w-xs truncate text-lg font-black text-slate-950">Answer Items</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
            aria-label="Close checklist"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          {sections.map((section) => (
            <section key={section.id} className="space-y-3">
              <h4 className="max-w-xs rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white wrap-anywhere">
                {section.title}
              </h4>

              {section.items.map((item, index) => {
                const isMissing = missingRequiredItemIds.has(item.id)

                return (
                  <div
                    key={item.id}
                    ref={(element) => setChecklistItemRef(item.id, element)}
                    tabIndex={isMissing ? -1 : undefined}
                    aria-invalid={isMissing || undefined}
                    className={`rounded-2xl border p-3 outline-none transition ${
                      isMissing ? "border-red-500 bg-red-50 ring-4 ring-red-100" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                  <p className="max-w-xs text-sm font-bold leading-6 text-slate-950 wrap-anywhere">
                    {index + 1}. {item.statement}
                    {item.isRequired ? <span className="ml-1 text-red-500">*</span> : null}
                  </p>

                  <div className="mt-3 grid gap-2">
                    {scale.map((option) => {
                      const isSelected = answers[item.id] === option.value

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateAnswer(item.id, option.value)}
                          className={`flex min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-black transition ${
                            isSelected ? "bg-cyan-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-cyan-50"
                          }`}
                          aria-label={`${item.statement}: ${option.label}`}
                          aria-pressed={isSelected}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-base">
                            {isSelected ? <CheckCircle2 className="size-5" /> : option.value}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}

type FragmentSectionProps = {
  sectionTitle: string
  items: SurveyQuestionnaireForm["sections"][number]["items"]
  scale: ReturnType<typeof normalizeScale>
  answers: Record<string, LikertValue>
  updateAnswer: (itemId: string, rating: LikertValue) => void
  missingRequiredItemIds: Set<string>
  setChecklistItemRef: (itemId: string, element: HTMLTableRowElement | HTMLDivElement | null) => void
}

function FragmentSection({
  sectionTitle,
  items,
  scale,
  answers,
  updateAnswer,
  missingRequiredItemIds,
  setChecklistItemRef,
}: FragmentSectionProps) {
  return (
    <>
      <tr className="bg-slate-950 text-white">
        <td colSpan={scale.length + 1} className="px-4 py-3 font-black wrap-anywhere">
          {sectionTitle}
        </td>
      </tr>
      {items.map((item, index) => {
        const isMissing = missingRequiredItemIds.has(item.id)

        return (
          <tr
            key={item.id}
            ref={(element) => setChecklistItemRef(item.id, element)}
            tabIndex={isMissing ? -1 : undefined}
            aria-invalid={isMissing || undefined}
            className={`border-t align-top outline-none transition ${
              isMissing ? "border-red-500 bg-red-50 ring-2 ring-red-100" : "border-slate-200"
            }`}
          >
          <td className={`px-4 py-4 text-slate-700 wrap-anywhere ${isMissing ? "border-y-2 border-l-2 border-red-500" : ""}`}>
            <span className="font-bold text-slate-950">{index + 1}. </span>
            {item.statement}
            {item.isRequired ? <span className="ml-1 text-red-500">*</span> : null}
          </td>
          {scale.map((option, optionIndex) => {
            const isSelected = answers[item.id] === option.value
            const isLastOption = optionIndex === scale.length - 1

            return (
              <td
                key={option.value}
                className={`px-3 py-4 text-center ${
                  isMissing ? `border-y-2 border-red-500 ${isLastOption ? "border-r-2" : ""}` : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => updateAnswer(item.id, option.value)}
                  className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm font-black transition ${
                    isSelected
                      ? "bg-cyan-600 text-white shadow-lg shadow-cyan-100"
                      : "bg-slate-100 text-slate-700 hover:bg-cyan-100 hover:text-cyan-700"
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
        )
      })}
    </>
  )
}

export default Survey