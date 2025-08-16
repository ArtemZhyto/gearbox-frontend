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
import { useManageItemScrollPosition } from '../hooks/useManageItemScrollPosition'
import DropdownSection from '../components/DropdownSection'

type Status = CriterionStaging['criterion_adjudication_status']
const statusOrder: Status[] = ['NEW', 'IN_PROCESS', 'EXISTING', 'ACTIVE']

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

  const {
    topRef,
    createScrollItemRef,
    scrollToItem,
    scrollToTop,
    showBackToTop,
  } = useManageItemScrollPosition<number>({
    topOffset: 96, // set to your sticky header height; use 0 if relying on CSS scroll-mt
    behavior: 'smooth',
    trackBackToTop: true,
    onAfterScrollToItem: (el) => {
      // optional flash highlight, replaces your old class toggling
      el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded')
      setTimeout(() => {
        el.classList.remove(
          'ring-2',
          'ring-blue-500',
          'ring-offset-2',
          'rounded'
        )
      }, 1200)
    },
  })
  // Collapsible groups
  const [open, setOpen] = useState<Record<Status, boolean>>({
    NEW: true,
    IN_PROCESS: true,
    EXISTING: true,
    ACTIVE: true,
  })

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
  }, [])

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
      const st = sc.criterion_adjudication_status
      ;(acc[st] ??= []).push(sc)
      return acc
    }, {} as Record<Status, CriterionStagingWithValueList[]>)
  }, [stagingCriteria])

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

    setOpen((o) => ({ ...o, [updated.criterion_adjudication_status]: true })) // ensure target group is open
    scrollToItem(updated.id) // hook defers until the item mounts if needed
  }

  if (loadingStatus === 'not started' || loadingStatus === 'sending') {
    return <div>Loading...</div>
  }
  if (loadingStatus === 'error') {
    return <ErrorRetry retry={loadPage} />
  }

  return (
    <div>
      {/* top sentinel: NOT sticky; first child in the scroll area */}
      <div ref={topRef} className="h-px w-px" aria-hidden />
      {showBackToTop && (
        <Button
          size="small"
          onClick={() => scrollToTop()}
          otherClassName="fixed bottom-6 right-6 rounded-full shadow-lg z-50"
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
          <DropdownSection
            key={st}
            id={`section-${st}`} // keeps your jump bar working
            name={`${st.replace('_', ' ')} (${list.length})`}
            isOpen={open[st]} // controlled by your state
            onToggle={(next) => setOpen((o) => ({ ...o, [st]: next }))}
            backgroundColor="bg-white"
            headerClassName="top-0" // matches your previous sticky top-0
          >
            {list.map((sc) => (
              <div
                key={sc.id}
                ref={createScrollItemRef(sc.id)}
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
          </DropdownSection>
        )
      })}
    </div>
  )
}
