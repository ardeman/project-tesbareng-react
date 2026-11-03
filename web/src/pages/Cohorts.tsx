// One lazy entry for /cohorts and /cohorts/:id: a single loader in main.tsx keeps the main chunk smaller
// (ADR-001 budget), and list → detail is the usual path, so sharing one chunk costs nothing extra.
import { useParams } from 'react-router-dom'
import { CohortDetail } from './CohortDetail'
import { CohortList } from './CohortList'
import './cohorts.css'

export default function Cohorts() {
  return useParams().id ? <CohortDetail /> : <CohortList />
}
