import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getStudyVersionsAdjudication } from '../api/studyAdjudication'
import {
  ApiStatus,
  CriteriaValue,
  InputType,
  CriterionStagingWithValueList,
  StudyVersionAdjudication,
  Criterion,
  CriterionStaging,
} from '../model'
import Field from '../components/Inputs/Field'
import { CriteriaAnnotationVerification } from '../components/CriteriaAnnotationVerification'
import { getInputTypes } from '../api/inputTypes'
import { ErrorRetry } from '../components/ErrorRetry'
import { getValues } from '../api/value'
import { getCriterionStaging } from '../api/criterionStaging'
import { getCriteria } from '../api/criterion'
import Button from '../components/Inputs/Button'

type Status = CriterionStaging['criterion_adjudication_status']
const statusOrder: Status[] = ['NEW', 'IN_PROCESS', 'EXISTING', 'ACTIVE']

function getEffectiveStatus(
  sc: CriterionStagingWithValueList,
  criteria: Criterion[]
): Status {
  if (sc.criterion_adjudication_status === 'ACTIVE') {
    return 'ACTIVE'
  }
  return criteria.some((c) => c.code === sc.code)
    ? 'EXISTING'
    : sc.criterion_adjudication_status
}

export function CriteriaAnnotationVerificationPage() {
  const [studyVersionsAdjudication, setStudyVersionsAdjudication] = useState<
    StudyVersionAdjudication[]
  >([])
  const [eligibilityCriteriaId, setEligibilityCriteriaId] = useState<
    number | ''
  >('')
  const [stagingCriteria, setStagingCriteria] = useState<
    CriterionStagingWithValueList[]
  >([])
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [values, setValues] = useState<CriteriaValue[]>([])
  const [inputTypes, setInputTypes] = useState<InputType[]>([])
  const [loadingStatus, setLoadingStatus] = useState<ApiStatus>('not started')

  // Back to top
  const topRef = useRef<HTMLDivElement | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  // Collapsible groups
  const [open, setOpen] = useState<Record<Status, boolean>>({
    NEW: true,
    IN_PROCESS: true,
    EXISTING: true,
    ACTIVE: true,
  })

  // Per-item refs + pending-scroll
  const itemRefs = useRef<Map<number, HTMLDivElement | null>>(new Map())
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null)
  const pendingScrollIdRef = useRef<number | null>(null)

  const registerItemRef = (id: number) => (el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(id, el)
      // If this is the row we're waiting for, scroll now (post-paint)
      if (pendingScrollIdRef.current === id) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          // Optional highlight
          el.classList.add(
            'ring-2',
            'ring-blue-500',
            'ring-offset-2',
            'rounded'
          )
          setTimeout(() => {
            el.classList.remove(
              'ring-2',
              'ring-blue-500',
              'ring-offset-2',
              'rounded'
            )
          }, 1200)
        })
        pendingScrollIdRef.current = null
        setPendingScrollId(null)
      }
    } else {
      itemRefs.current.delete(id)
    }
  }

  // Fallback retry (in case layout shifts)
  useEffect(() => {
    if (pendingScrollId == null) return
    let tries = 0
    let raf = 0
    const tick = () => {
      const el = itemRefs.current.get(pendingScrollId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setPendingScrollId(null)
        return
      }
      if (tries++ < 8) raf = requestAnimationFrame(tick)
      else setPendingScrollId(null)
    }
    raf = requestAnimationFrame(() => requestAnimationFrame(tick))
    return () => cancelAnimationFrame(raf)
  }, [pendingScrollId])

  const loadPage = () => {
    Promise.all([
      getStudyVersionsAdjudication(),
      getValues(),
      getInputTypes(),
      getCriteria(),
    ])
      .then(([studyVersions, values, inputTypes, criteria]) => {
        setStudyVersionsAdjudication(studyVersions)
        setValues(values.filter((v) => !v.is_numeric && v.unit_id === 1))
        setInputTypes(inputTypes)
        setCriteria(criteria)
        setLoadingStatus('success')
      })
      .catch((err) => {
        console.error(err)
        setLoadingStatus('error')
      })
  }

  useEffect(() => {
    setLoadingStatus('sending')
    loadPage()
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = () => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const onStudyChanged = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const ebcId = +event.target.value
    getCriterionStaging(ebcId)
      .then((sc) => {
        setStagingCriteria(sc)
        setEligibilityCriteriaId(ebcId)
      })
      .catch(() => setStagingCriteria([]))
  }

  // Group once, render many
  const grouped = useMemo(() => {
    return stagingCriteria.reduce((acc, sc) => {
      const st = getEffectiveStatus(sc, criteria)
      ;(acc[st] ??= []).push(sc)
      return acc
    }, {} as Record<Status, CriterionStagingWithValueList[]>)
  }, [stagingCriteria, criteria])

  const counts = {
    NEW: grouped.NEW?.length ?? 0,
    IN_PROCESS: grouped.IN_PROCESS?.length ?? 0,
    EXISTING: grouped.EXISTING?.length ?? 0,
    ACTIVE: grouped.ACTIVE?.length ?? 0,
  }

  // When a child updates, regroup and plan a scroll-to-row
  const handleStagingUpdated = (updated: CriterionStagingWithValueList) => {
    setStagingCriteria((prev) =>
      prev.map((x) => (x.id === updated.id ? updated : x))
    )

    const newStatus = getEffectiveStatus(updated, criteria)
    setOpen((o) => ({ ...o, [newStatus]: true })) // ensure target group is open

    pendingScrollIdRef.current = updated.id // for ref callback
    setPendingScrollId(updated.id) // for fallback effect
  }

  if (loadingStatus === 'not started' || loadingStatus === 'sending') {
    return <div>Loading...</div>
  }
  if (loadingStatus === 'error') {
    return <ErrorRetry retry={loadPage} />
  }

  return (
    <div ref={topRef}>
      {showBackToTop && (
        <Button
          size="small"
          onClick={scrollToTop}
          otherClassName="fixed bottom-6 right-6 rounded-full shadow-lg"
          aria-label="Back to top"
        >
          Back to Top
        </Button>
      )}

      {/* Study selector */}
      <Field
        config={{
          type: 'select',
          label: 'Select a Study to Adjudicate',
          placeholder: 'Select One',
          name: 'studyVersion',
          options: studyVersionsAdjudication.map((sva) => ({
            value: sva.eligibility_criteria_id,
            label: `${sva.study.code} - ${sva.study.name}`,
          })),
        }}
        value={eligibilityCriteriaId}
        onChange={onStudyChanged}
      />

      {/* Jump Bar (uses section ids instead of refs) */}
      <div className="mt-3 flex flex-wrap gap-2">
        {statusOrder.map((st) => (
          <button
            key={st}
            className="px-3 py-1 rounded-full border"
            onClick={() =>
              document
                .getElementById(`section-${st}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            {st.replace('_', ' ')} ({counts[st]})
          </button>
        ))}
      </div>

      {/* Grouped sections */}
      {statusOrder.map((st) => {
        const list = (grouped[st] ?? []).slice().sort((a, b) => a.id - b.id)
        if (!list.length) return null

        return (
          <div key={st} id={`section-${st}`} className="mt-6 scroll-mt-24">
            {/* Sticky/collapsible header */}
            <div className="sticky top-0 z-10 bg-white border-b py-2 flex items-center justify-between">
              <h2 className="font-semibold">
                {st.replace('_', ' ')} ({list.length})
              </h2>
              <button
                className="text-sm underline"
                onClick={() => setOpen((o) => ({ ...o, [st]: !o[st] }))}
              >
                {open[st] ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {open[st] && (
              <div className="mt-2">
                {list.map((sc) => (
                  <div
                    key={sc.id}
                    ref={registerItemRef(sc.id)}
                    id={`crit-${sc.id}`}
                    className="scroll-mt-24"
                  >
                    <CriteriaAnnotationVerification
                      stagingCriterion={sc}
                      criteria={criteria}
                      lookupValues={values}
                      inputTypes={inputTypes}
                      setLookupValues={setValues}
                      onStagingUpdated={handleStagingUpdated}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
