import { useEffect, useState } from 'react'

export function useSessionSnapshot(): CodeMungSessionSnapshot | null {
  const [snapshot, setSnapshot] = useState<CodeMungSessionSnapshot | null>(null)

  useEffect(() => {
    let isMounted = true

    void window.codemung?.getSessionSnapshot().then((initial) => {
      // A pushed snapshot may already have arrived, so the initial read never overwrites it.
      if (isMounted && initial) setSnapshot((current) => current ?? initial)
    })

    const unsubscribe = window.codemung?.onSessionSnapshot(setSnapshot)

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [])

  return snapshot
}
