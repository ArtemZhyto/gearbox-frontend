import React, { useEffect, useState } from 'react'
import { getStudyVersionsAdjudication } from '../api/studyAdjudication'
import {
  ApiStatus,
  CriteriaValue,
  InputType,
  CriterionStagingWithValueList,
  StudyVersionAdjudication,
  Criterion,
} from '../model'
import Field from '../components/Inputs/Field'
import { CriteriaAnnotationVerification } from '../components/CriteriaAnnotationVerification'
import { getInputTypes } from '../api/inputTypes'
import { ErrorRetry } from '../components/ErrorRetry'
import { getValues } from '../api/value'
import { getCriterionStaging } from '../api/criterionStaging'
import { getCriteria } from '../api/criterion'

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

  if (loadingStatus === 'not started' || loadingStatus === 'sending') {
    return <div>Loading...</div>
  } else if (loadingStatus === 'error') {
    return <ErrorRetry retry={loadPage} />
  }

  return (
    <div>
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
      {stagingCriteria.length ? (
        stagingCriteria
          .sort((a, b) => a.id - b.id)
          .map((sc) => (
            <CriteriaAnnotationVerification
              key={sc.id}
              stagingCriterion={sc}
              criteria={criteria}
              lookupValues={values}
              inputTypes={inputTypes}
              setLookupValues={setValues}
            />
          ))
      ) : (
        <div className="mt-4">No Staging Criteria Found</div>
      )}
    </div>
  )
}
