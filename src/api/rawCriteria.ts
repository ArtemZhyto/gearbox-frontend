import { RawCriterion } from '../model'
import { fetchGearbox } from './utils'

export function getRawCriterion(ebcId: number): Promise<RawCriterion | null> {
  return fetchGearbox(`/gearbox/raw-criteria-ec/${ebcId}`).then((res) => {
    if (res.status === 404) {
      return null
    }
    if (!res.ok) {
      throw new Error('Fail to get raw criteria')
    }

    return res.json() as Promise<RawCriterion>
  })
}
