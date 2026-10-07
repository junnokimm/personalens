import { exportCsv } from '../../lib/csv.js'
import { useUiStore } from '../../store/useUiStore.js'

const FORMATS = [['long', '응답 CSV · 세로형'], ['wide', '분석 CSV · 가로형'], ['codebook', '문항·코드표 CSV']]

/* 원본 exportView()/downloadCsv() */
export default function ExportView({ project, run }) {
  const showToast = useUiStore((s) => s.showToast)

  function downloadCsv(format) {
    const text = exportCsv(project, run, format)
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `PersonaScope_실행${run.number}_${format}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast('CSV를 내려받았습니다.')
  }

  return (
    <section className="card">
      <h2>CSV 내보내기</h2>
      <p className="muted">실행 #{run.number} 전체를 내보냅니다. 후속 질문은 q1_1, q1_2처럼 열 이름이 붙습니다.</p>
      <div className="row">
        {FORMATS.map(([format, label]) => <button key={format} onClick={() => downloadCsv(format)}>{label}</button>)}
      </div>
      <p className="muted small-text">세로형: 응답 하나가 한 행 · 가로형: 페르소나 한 명이 한 행</p>
    </section>
  )
}
