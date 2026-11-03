import { useCallback, useMemo, useState } from 'react'

/**
 * Touched-field validation (ADR-009 §6): a field shows its error after it loses focus, and every
 * field does after a submit attempt. `check()` marks all touched and returns the ids of fields in
 * error, in `order`, so the caller can focus the first one.
 */
export function useValidation<K extends string>(errorsNow: Partial<Record<K, string>>, order: readonly K[]) {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({})
  const [all, setAll] = useState(false)
  const errors = useMemo(() => {
    const out: Partial<Record<K, string>> = {}
    for (const k of order) if (errorsNow[k] && (all || touched[k])) out[k] = errorsNow[k]
    return out
  }, [errorsNow, touched, all, order])
  const blur = useCallback((k: K) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true })), [])
  const check = useCallback(() => {
    setAll(true)
    return order.filter((k) => !!errorsNow[k])
  }, [errorsNow, order])
  const reset = useCallback(() => { setTouched({}); setAll(false) }, [])
  return { errors, blur, check, reset }
}
