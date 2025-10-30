import { Unit } from '../model'
import { fetchGearbox } from './utils'

export function getUnits(): Promise<Unit[]> {
  return fetchGearbox('/gearbox/units')
    .then((res) => res.json() as Promise<{ results: Unit[] }>)
    .then((res) => res.results)
}

export function createUnit(unit: Unit): Promise<Unit> {
  return fetchGearbox('/gearbox/unit', {
    method: 'POST',
    body: JSON.stringify({ name: unit.name }),
  }).then((res) => {
    if (!res.ok) {
      throw new Error('Failed to create new unit')
    }
    return res.json() as Promise<Unit>
  })
}
