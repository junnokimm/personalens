export function runProgress(run) {
  if (!run) return { total: 0, succeeded: 0, failed: 0, remaining: 0, percent: 0 }
  const total = run.total ?? (run.people?.length || run.peopleCount || 0) * (run.survey?.questions.length || 0)
  const succeeded = run.succeeded ?? (run._server ? run.responseCount || 0 : Math.floor(total * (run.progress || 0) / 100))
  const failed = run.failed || 0
  const processed = Math.min(total, succeeded + failed)
  return { total, succeeded, failed, remaining: Math.max(0, total - processed),
    percent: total ? Math.floor(processed * 100 / total) : 0 }
}
