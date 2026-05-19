import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ontologyApi } from '@/api/ontologies'
import ConfidenceBar from '@/components/ConfidenceBar'
import { Pencil, Trash2, Plus } from 'lucide-react'
import type { Action } from '@/types/ontology'

export default function ActionsTab({ ontologyId }: { ontologyId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const { register, handleSubmit, reset } = useForm<Partial<Action>>()

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['actions', ontologyId],
    queryFn: () => ontologyApi.listActions(ontologyId) as any,
  })

  const createMut = useMutation({
    mutationFn: (data: Partial<Action>) => ontologyApi.createAction(ontologyId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['actions', ontologyId] }); qc.invalidateQueries({ queryKey: ['stats'] }); setShowCreate(false); reset() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => ontologyApi.deleteAction(ontologyId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['actions', ontologyId] }); qc.invalidateQueries({ queryKey: ['stats'] }) },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setShowCreate(true); reset() }}
          className="flex items-center gap-2 px-3 py-2 bg-black text-white rounded-lg text-sm">
          <Plus size={14} /> {t('actions.add')}
        </button>
      </div>
      <div className="bg-white border rounded-lg overflow-hidden">
        {isLoading ? <p className="py-8 text-center text-gray-400">{t('common.loading')}</p> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{[t('entities.col_name_cn'), t('actions.col_exec'), t('entities.col_desc'), t('entities.col_confidence'), t('entities.col_actions')].map(h => (
                <th key={h} className="px-4 py-3 text-left text-gray-500 text-xs font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(actions as Action[]).map(a => (
                <tr key={a.id} className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/ontologies/${ontologyId}/actions/${a.id}`)}>
                  <td className="px-4 py-3 font-medium">{a.name_cn}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{a.execution_rule || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{a.description || '—'}</td>
                  <td className="px-4 py-3 w-32"><ConfidenceBar value={a.confidence} /></td>
                  <td className="px-4 py-3 space-x-2" onClick={ev => ev.stopPropagation()}>
                    <button onClick={() => navigate(`/ontologies/${ontologyId}/actions/${a.id}`)} className="text-blue-500"><Pencil size={14} /></button>
                    <button onClick={() => deleteMut.mutate(a.id)} className="text-red-500"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && (actions as Action[]).length === 0 && <p className="text-center text-gray-400 py-8">{t('actions.empty')}</p>}
      </div>
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h3 className="font-semibold mb-4">{t('actions.add')}</h3>
            <form onSubmit={handleSubmit(data => createMut.mutate(data))} className="space-y-3">
              <input {...register('name_cn', { required: true })} placeholder={t('entities.ph_name_cn')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input {...register('name_en')} placeholder={t('entities.ph_name_en')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <textarea {...register('execution_rule')} placeholder={t('actions.ph_exec')} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              <textarea {...register('description')} placeholder={t('entities.ph_desc')} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              <input {...register('confidence', { valueAsNumber: true })} type="number" step="0.01" min="0" max="1" placeholder={t('entities.ph_confidence')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); reset() }} className="px-4 py-2 border rounded-lg text-sm">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 bg-black text-white rounded-lg text-sm">{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
