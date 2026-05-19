import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ontologyApi } from '@/api/ontologies'
import StatusBadge from '@/components/StatusBadge'
import ConfirmDialog from '@/components/ConfirmDialog'
import { DOMAINS } from '@/types/ontology'
import type { OntologyListItem } from '@/types/ontology'
import { X } from 'lucide-react'

export default function OntologyListPage() {
  const [idFilter, setIdFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState(DOMAINS[0])
  const [newDesc, setNewDesc] = useState('')
  const [createError, setCreateError] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['ontologies'],
    queryFn: () => ontologyApi.list({ page_size: 1000 }) as any,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => ontologyApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontologies'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setDeleteTarget(null)
    },
  })

  const createMut = useMutation({
    mutationFn: () => ontologyApi.create({ name: newName, domain: newDomain, description: newDesc }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['ontologies'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setShowCreate(false)
      setNewName(''); setNewDomain(DOMAINS[0]); setNewDesc('')
      navigate(`/ontologies/${res.id}`)
    },
    onError: (e: any) => {
      setCreateError(e?.message || e?.detail?.message || t('ontology.create_failed'))
    }
  })

  const allItems: OntologyListItem[] = data?.items ?? []

  const filteredItems = useMemo(() => {
    let list = allItems
    if (idFilter.trim())
      list = list.filter(o => o.id.toLowerCase().includes(idFilter.trim().toLowerCase()))
    if (nameFilter.trim())
      list = list.filter(o => o.name.toLowerCase().includes(nameFilter.trim().toLowerCase()))
    if (dateFrom)
      list = list.filter(o => new Date(o.created_at) >= new Date(dateFrom))
    if (dateTo)
      list = list.filter(o => new Date(o.created_at) <= new Date(dateTo + 'T23:59:59'))
    return list
  }, [allItems, idFilter, nameFilter, dateFrom, dateTo])

  const hasFilters = idFilter || nameFilter || dateFrom || dateTo

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{t('ontology.title')}</h2>
        <button onClick={() => { setShowCreate(true); setCreateError('') }}
          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800">
          {t('ontology.create')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">ID</label>
          <input value={idFilter} onChange={e => setIdFilter(e.target.value)}
            placeholder={t('ontology.search_id')}
            className="border rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('ontology.name')}</label>
          <input value={nameFilter} onChange={e => setNameFilter(e.target.value)}
            placeholder={t('ontology.filter_placeholder')}
            className="border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('ontology.date_from')}</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('ontology.date_to')}</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        {hasFilters && (
          <button onClick={() => { setIdFilter(''); setNameFilter(''); setDateFrom(''); setDateTo('') }}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50 self-end">
            <X size={14} /> {t('ontology.clear_filter')}
          </button>
        )}
        {hasFilters && (
          <span className="text-xs text-gray-400 self-end pb-2">
            {t('ontology.count_summary', { filtered: filteredItems.length, total: allItems.length })}
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['ID', t('ontology.name'), t('ontology.domain'), t('ontology.version'), t('ontology.status'), t('ontology.created_at'), t('ontology.updated'), t('ontology.actions')].map(h => (
                <th key={h} className="px-4 py-3 text-left text-gray-500 font-medium text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : filteredItems.map((o) => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-400" title={o.id}>{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-medium">{o.name}</td>
                <td className="px-4 py-3 text-gray-500">{o.domain}</td>
                <td className="px-4 py-3 text-gray-500">{o.version}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.created_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.updated_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</td>
                <td className="px-4 py-3 space-x-3">
                  <button onClick={() => navigate(`/ontologies/${o.id}`)}
                    className="text-blue-600 hover:underline text-xs">{t('ontology.view')}</button>
                  <button onClick={() => setDeleteTarget({ id: o.id, name: o.name })}
                    className="text-red-600 hover:underline text-xs">{t('ontology.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filteredItems.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            {hasFilters ? t('ontology.no_match') : t('ontology.empty')}
          </p>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h3 className="font-semibold mb-4">{t('ontology.create')}</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder={`${t('ontology.name')} *`}
              className="w-full border rounded-lg px-3 py-2 mb-3 text-sm" />
            <select value={newDomain} onChange={e => setNewDomain(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 text-sm">
              {DOMAINS.map(d => <option key={d}>{d}</option>)}
            </select>
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder={t('ontology.desc_optional')} rows={2}
              className="w-full border rounded-lg px-3 py-2 mb-4 text-sm resize-none" />
            {createError && <p className="text-red-500 text-xs mb-3">{createError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">{t('common.cancel')}</button>
              <button onClick={() => createMut.mutate()} disabled={!newName || createMut.isPending}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm disabled:opacity-50">
                {createMut.isPending ? t('common.loading') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('ontology.confirm_delete')}
        message={t('ontology.confirm_delete_msg', { name: deleteTarget?.name })}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
