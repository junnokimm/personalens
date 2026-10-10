import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { parseResultUrlState, updateResultSearchParams } from './resultUrlState.js'

const ResultUrlContext = createContext(null)

export function ResultUrlProvider({ run, children }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.toString()
  const state = useMemo(() => parseResultUrlState(run, new URLSearchParams(query)), [run, query])

  useEffect(() => {
    const canonical = updateResultSearchParams(run, new URLSearchParams(query), {})
    if (canonical.toString() !== query) setSearchParams(canonical, { replace: true })
  }, [query, run, setSearchParams])

  const navigateResult = useCallback((changes, options = {}) => {
    const next = updateResultSearchParams(run, new URLSearchParams(query), changes)
    setSearchParams(next, options)
  }, [query, run, setSearchParams])

  const value = useMemo(() => ({ ...state, navigateResult }), [state, navigateResult])
  return <ResultUrlContext.Provider value={value}>{children}</ResultUrlContext.Provider>
}

export function useResultUrl() {
  const value = useContext(ResultUrlContext)
  if (!value) throw new Error('useResultUrl must be used inside ResultUrlProvider')
  return value
}
