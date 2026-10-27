"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JobView } from "@/components/job-status";

/** Follows a job over server-sent events. The stream closes on its own after a window; EventSource reconnects. */
export function useJob(onFinish?: (job: JobView) => void) {
  const [job, setJob] = useState<JobView | null>(null);
  const source = useRef<EventSource | null>(null);
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const watch = useCallback(
    (jobId: string, initial?: JobView) => {
      stop();
      if (initial) setJob(initial);
      const es = new EventSource(`/api/jobs/${jobId}/stream`);
      source.current = es;
      es.addEventListener("job", (ev) => {
        const j = JSON.parse((ev as MessageEvent).data) as JobView;
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          stop();
          finish.current?.(j);
        }
      });
      es.addEventListener("error", (ev) => {
        if ((ev as MessageEvent).data) {
          stop();
          setJob(null);
        }
      });
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    setJob(null);
  }, [stop]);

  return { job, watch, reset };
}
