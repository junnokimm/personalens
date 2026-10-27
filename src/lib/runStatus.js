export const isRunActive = (run) => ['queued', 'running'].includes(run?.status)
export const canRetryRun = (run) => ['failed', 'partial_failed'].includes(run?.status)
export const hasRunResults = (run) => run?.status === 'completed' || (['partial_failed', 'cancelled'].includes(run?.status) && (run.responseCount ?? run.responses?.length ?? 0) > 0)
export const runPeopleCount = (run) => run.peopleCount ?? run.people?.length ?? 0
