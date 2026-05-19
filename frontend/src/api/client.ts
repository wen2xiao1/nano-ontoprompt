import axios from 'axios'

export const apiClient = axios.create({ baseURL: '/api/v1' })

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  res => res.data.data !== undefined ? res.data.data : res.data,
  err => Promise.reject(err.response?.data ?? err)
)
