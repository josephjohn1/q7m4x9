import { useEffect, useState } from "react";

export function useApi<T>(path: string, retry = 0) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message =
            typeof body?.detail === "string"
              ? body.detail
              : `The request failed (${response.status}).`;
          throw new Error(message);
        }
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            error: error.message || "Unable to reach the API.",
            loading: false,
          });
      });
    return () => controller.abort();
  }, [path, retry]);
  return state;
}
