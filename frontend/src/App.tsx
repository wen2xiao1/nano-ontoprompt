import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/login/LoginPage'
import RegisterPage from '@/pages/register/RegisterPage'
import OverviewPage from '@/pages/overview/OverviewPage'
import OntologyListPage from '@/pages/ontologies/list/OntologyListPage'
import OntologyDetailPage from '@/pages/ontologies/detail/OntologyDetailPage'
import EntityDetailPage from '@/pages/ontologies/detail/entity/EntityDetailPage'
import LogicDetailPage from '@/pages/ontologies/detail/logic/LogicDetailPage'
import ActionDetailPage from '@/pages/ontologies/detail/action/ActionDetailPage'
import PromptListPage from '@/pages/prompts/PromptListPage'
import PromptDetailPage from '@/pages/prompts/PromptDetailPage'
import ModelsPage from '@/pages/models/ModelsPage'
import SettingsPage from '@/pages/settings/SettingsPage'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } }
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <Layout>{children}</Layout> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />
          <Route path="/ontologies" element={<ProtectedRoute><OntologyListPage /></ProtectedRoute>} />
          <Route path="/ontologies/:id" element={<ProtectedRoute><OntologyDetailPage /></ProtectedRoute>} />
          <Route path="/ontologies/:id/entities/:eid" element={<ProtectedRoute><EntityDetailPage /></ProtectedRoute>} />
          <Route path="/ontologies/:id/logic/:lid" element={<ProtectedRoute><LogicDetailPage /></ProtectedRoute>} />
          <Route path="/ontologies/:id/actions/:aid" element={<ProtectedRoute><ActionDetailPage /></ProtectedRoute>} />
          <Route path="/prompts" element={<ProtectedRoute><PromptListPage /></ProtectedRoute>} />
          <Route path="/prompts/:id" element={<ProtectedRoute><PromptDetailPage /></ProtectedRoute>} />
          <Route path="/models" element={<ProtectedRoute><ModelsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
