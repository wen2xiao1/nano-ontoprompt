import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { ontologyApi } from '@/api/ontologies'
import { apiClient } from '@/api/client'
import { Trash2, Upload } from 'lucide-react'

export default function FilesTab({ ontologyId }: { ontologyId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['files', ontologyId],
    queryFn: () => ontologyApi.listFiles(ontologyId) as any,
  })

  const deleteMut = useMutation({
    mutationFn: (fid: string) => ontologyApi.deleteFile(ontologyId, fid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', ontologyId] }),
  })

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true)
    for (const file of acceptedFiles) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        await apiClient.post(`/ontologies/${ontologyId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        } as any)
      } catch (e) {
        console.error('Upload failed:', file.name, e)
      }
    }
    setUploading(false)
    qc.invalidateQueries({ queryKey: ['files', ontologyId] })
  }, [ontologyId, qc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
    },
    multiple: true,
  })

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      <div {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'
        }`}>
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-2 text-gray-400" size={32} />
        <p className="text-sm text-gray-500">
          {uploading ? t('files.uploading') : isDragActive ? t('files.drop_release') : t('files.drag_hint')}
        </p>
        <p className="text-xs text-gray-400 mt-1">{t('files.supported')}</p>
      </div>

      {isLoading ? <p className="text-gray-400 text-sm">{t('common.loading')}</p> : (
        <div className="bg-white rounded-lg border overflow-hidden">
          {(files as any[]).length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">{t('files.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[t('files.col_name'), t('files.col_size'), t('files.col_type'), t('files.col_uploaded'), t('files.col_actions')].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-gray-500 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(files as any[]).map((f: any) => (
                  <tr key={f.id} className="border-b">
                    <td className="px-4 py-3">{f.filename}</td>
                    <td className="px-4 py-3 text-gray-500">{formatSize(f.file_size)}</td>
                    <td className="px-4 py-3 text-gray-500">{f.mime_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => deleteMut.mutate(f.id)}
                        className="text-red-500 hover:text-red-700">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
