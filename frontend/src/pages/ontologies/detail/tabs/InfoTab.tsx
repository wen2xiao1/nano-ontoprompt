import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ontologyApi, promptApi, modelApi } from '@/api/ontologies'
import { CheckCircle, XCircle, Loader2, ChevronRight, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import type { OntologyDetail } from '@/types/ontology'
import { loadRuleStates, getActiveConstraints } from '@/utils/extractionRules'

const SEVERITY_CONFIG = {
  fatal:   { label: 'FATAL',   bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   icon: XCircle },
  error:   { label: 'ERROR',   bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-600',   icon: AlertCircle },
  warning: { label: 'WARNING', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle },
  info:    { label: 'INFO',    bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',  icon: Info },
}

function ValidationReportCard({ report }: { report: any }) {
  const { t } = useTranslation()
  if (!report) return null
  const bySeverity = report.by_severity ?? {}
  const allEmpty = Object.values(bySeverity).every((arr: any) => arr.length === 0)
  const overallOk = !report.has_fatal && !report.has_errors

  return (
    <div className={`bg-white rounded-xl border p-6 ${report.has_fatal ? 'border-red-300' : report.has_errors ? 'border-amber-300' : 'border-green-200'}`}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold">{t('extract.quality_report')}</h3>
        {overallOk && !allEmpty ? (
          <span className="ml-auto text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle size={11} /> {t('extract.quality_pass')}
          </span>
        ) : overallOk && allEmpty ? (
          <span className="ml-auto text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle size={11} /> {t('extract.quality_perfect')}
          </span>
        ) : (
          <span className="ml-auto text-xs bg-red-50 border border-red-200 text-red-600 px-2 py-0.5 rounded-full">
            {t('extract.issues_count', { count: report.total_issues })}
          </span>
        )}
      </div>

      {allEmpty ? (
        <p className="text-sm text-gray-400">{t('extract.no_issues')}</p>
      ) : (
        <div className="space-y-3">
          {(['fatal', 'error', 'warning', 'info'] as const).map(sev => {
            const issues = bySeverity[sev] ?? []
            if (!issues.length) return null
            const cfg = SEVERITY_CONFIG[sev]
            const Icon = cfg.icon
            return (
              <div key={sev} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
                <p className={`text-xs font-semibold ${cfg.text} mb-1.5`}>{cfg.label} · {issues.length} 项</p>
                <ul className="space-y-1">
                  {issues.map((issue: any, i: number) => (
                    <li key={i} className={`flex items-start gap-1.5 text-xs ${cfg.text}`}>
                      <Icon size={11} className="mt-0.5 flex-shrink-0" />
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STAGE_KEYS = [
  { key: 'queued',            i18nKey: 'extract.stage_queued' },
  { key: 'loading files',     i18nKey: 'extract.stage_loading' },
  { key: 'calling LLM',      i18nKey: 'extract.stage_llm' },
  { key: 'validating output', i18nKey: 'extract.stage_validating' },
  { key: 'saving results',    i18nKey: 'extract.stage_saving' },
  { key: 'done',              i18nKey: 'extract.stage_done' },
]

const STAGE_PCT: Record<string, number> = {
  queued: 0, 'loading files': 10, 'calling LLM': 40,
  'validating output': 65, 'saving results': 80, done: 100,
}

const lastTaskKey = (oid: string) => `ontoprompt_last_task_${oid}`

export default function InfoTab({ ontology }: { ontology: OntologyDetail }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [promptId, setPromptId] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [taskStatus, setTaskStatus] = useState<any>(() => {
    // Restore last task result for this ontology so P0 report persists after tab-switch
    try {
      const saved = localStorage.getItem(lastTaskKey(ontology.id))
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const { data: prompts } = useQuery({ queryKey: ['prompts'], queryFn: () => promptApi.list() as any })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: () => modelApi.list() as any })
  const { data: files = [] } = useQuery({
    queryKey: ['files', ontology.id],
    queryFn: () => ontologyApi.listFiles(ontology.id) as any,
  })

  const extractMut = useMutation({
    mutationFn: (constraints: string[]) =>
      ontologyApi.startExtraction(ontology.id, {
        prompt_id: promptId,
        model_id: modelId,
        model_name: modelName,
        constraints,
      }),
  })

  const startPoll = (taskId: string) => {
    let attempts = 0
    const poll = async () => {
      if (attempts++ > 90) return
      try {
        const status: any = await ontologyApi.getExtractionStatus(ontology.id, taskId)
        setTaskStatus(status)
        if (status.status === 'completed' || status.status === 'failed') {
          try { localStorage.setItem(lastTaskKey(ontology.id), JSON.stringify(status)) } catch {}
        }
        if (status.status !== 'completed' && status.status !== 'failed') {
          setTimeout(poll, 2000)
        } else {
          qc.invalidateQueries({ queryKey: ['ontology', ontology.id] })
          qc.invalidateQueries({ queryKey: ['stats'] })
          qc.invalidateQueries({ queryKey: ['entities', ontology.id] })
          qc.invalidateQueries({ queryKey: ['logic', ontology.id] })
          qc.invalidateQueries({ queryKey: ['actions', ontology.id] })
        }
      } catch {
        setTimeout(poll, 3000)
      }
    }
    poll()
  }

  const handleExtract = async () => {
    setTaskStatus({ status: 'running', progress: { stage: 'queued', pct: 0 }, error: null } as any)
    const constraints = getActiveConstraints(loadRuleStates())
    try {
      const res: any = await extractMut.mutateAsync(constraints)
      startPoll(res.task_id)
    } catch (e: any) {
      setTaskStatus({
        status: 'failed',
        progress: { stage: 'error', pct: 0 },
        error: String(e?.detail || e?.message || e),
      } as any)
    }
  }

  const selectedModel = (models as any[] | undefined)?.find((m: any) => m.id === modelId)
  const activeConstraints = getActiveConstraints(loadRuleStates())
  const fileList = files as any[]
  const isExtracting = taskStatus && taskStatus.status !== 'completed' && taskStatus.status !== 'failed'
  const currentPct = taskStatus?.progress?.pct ?? 0
  const currentStage = taskStatus?.progress?.stage ?? ''

  return (
    <div className="space-y-5">
      {/* LLM Config */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-semibold">{t('extract.llm_config')}</h3>
          {activeConstraints.length > 0 && (
            <span className="ml-auto text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
              {t('extract.constraints_active', { count: activeConstraints.length })}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('extract.prompt_label')}</label>
            <select value={promptId} onChange={e => setPromptId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('extract.select_prompt')}</option>
              {(prompts as any[] || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}（{p.domain}）</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('extract.model_label')}</label>
            <select value={modelId} onChange={e => { setModelId(e.target.value); setModelName('') }}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('extract.select_model')}</option>
              {(models as any[] || []).map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}（{m.provider}）</option>
              ))}
            </select>
          </div>

          {selectedModel && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('extract.model_specific')}</label>
              <select value={modelName} onChange={e => setModelName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">{t('extract.select')}</option>
                {(selectedModel.models || []).map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-1 flex items-center gap-3">
            <button
              onClick={handleExtract}
              disabled={!promptId || !modelId || !modelName || extractMut.isPending || isExtracting || fileList.length === 0}
              className="px-5 py-2 bg-black text-white rounded-lg text-sm disabled:opacity-40 flex items-center gap-2">
              {isExtracting && <Loader2 size={14} className="animate-spin" />}
              {isExtracting ? t('extract.extracting') : t('extract.start')}
            </button>
            {fileList.length === 0 && (
              <span className="text-xs text-gray-400">{t('extract.need_files')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Extraction Progress */}
      {taskStatus && (
        <div className={`bg-white rounded-xl border p-6 ${taskStatus.status === 'failed' ? 'border-red-200 bg-red-50' : ''}`}>
          <h3 className="font-semibold mb-4">{t('extract.progress')}</h3>

          {taskStatus.status === 'failed' ? (
            <div className="flex items-start gap-2 text-red-600">
              <XCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{t('extract.failed')}</p>
                <p className="text-xs mt-0.5 text-red-500">{taskStatus.error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Stage steps */}
              <div className="flex items-center mb-5 overflow-x-auto pb-1">
                {STAGE_KEYS.map((stage, i) => {
                  const stagePct = STAGE_PCT[stage.key] ?? 0
                  const passed = currentPct >= stagePct
                  const done = taskStatus.status === 'completed'
                  return (
                    <div key={stage.key} className="flex items-center flex-shrink-0">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                          passed
                            ? done ? 'bg-green-500 text-white' : 'bg-black text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {passed && done ? <CheckCircle size={14} /> : i + 1}
                        </div>
                        <span className={`text-xs whitespace-nowrap ${passed ? 'text-gray-700' : 'text-gray-400'}`}>
                          {t(stage.i18nKey)}
                        </span>
                      </div>
                      {i < STAGE_KEYS.length - 1 && (
                        <ChevronRight size={14} className="text-gray-300 mx-2 flex-shrink-0 mb-4" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-700 ${
                    taskStatus.status === 'completed' ? 'bg-green-500' : 'bg-black'
                  }`}
                  style={{ width: `${currentPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{currentPct}%{currentStage ? ` · ${currentStage}` : ''}</p>
            </>
          )}
        </div>
      )}

      {/* Validation Report */}
      {taskStatus?.validation_report && (
        <ValidationReportCard report={taskStatus.validation_report} />
      )}

      {/* Export */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">{t('extract.export')}</h3>
        <div className="flex gap-2 flex-wrap">
          {['json', 'yaml', 'csv', 'ttl', 'html'].map(fmt => (
            <a key={fmt} href={ontologyApi.exportUrl(ontology.id, fmt)}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 font-mono text-gray-700"
              download>
              {fmt.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
