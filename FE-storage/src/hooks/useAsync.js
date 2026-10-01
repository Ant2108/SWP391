import { useCallback, useEffect, useRef, useState } from 'react'

/** Chạy hàm async khi deps đổi; trả về { data, loading, error, reload }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef.current()
      .then((data) => id === seq.current && setState({ data, loading: false, error: null }))
      .catch((error) => id === seq.current && setState({ data: null, loading: false, error }))
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)
  return { ...state, reload: run }
}
