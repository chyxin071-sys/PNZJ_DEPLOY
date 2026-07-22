import type { Case, CreateCaseRequest, UpdateCaseRequest, Designer, Community } from '@/types'

const API_BASE = '/api'

const getAdminToken = () => localStorage.getItem('admin_token') || ''

const authHeaders = () => {
  const token = getAdminToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const loginAdmin = async (
  username: string,
  password: string,
): Promise<{ token: string; username: string }> => {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    throw new Error('Invalid username or password')
  }
  return response.json()
}

export const fetchCases = async (community?: string): Promise<Case[]> => {
  const params = community ? `?community=${encodeURIComponent(community)}` : ''
  const response = await fetch(`${API_BASE}/cases${params}`)
  return response.json()
}

export const fetchCaseById = async (id: string): Promise<Case> => {
  const response = await fetch(`${API_BASE}/cases/${id}`)
  if (!response.ok) {
    throw new Error('Case not found')
  }
  return response.json()
}

export const createCase = async (data: CreateCaseRequest): Promise<Case> => {
  const response = await fetch(`${API_BASE}/cases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data)
  })
  return response.json()
}

export const updateCase = async (id: string, data: UpdateCaseRequest): Promise<Case> => {
  const response = await fetch(`${API_BASE}/cases/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data)
  })
  return response.json()
}

export const deleteCase = async (id: string): Promise<void> => {
  await fetch(`${API_BASE}/cases/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

export const uploadImage = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData()
  formData.append('image', file)
  
  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  })
  return response.json()
}

export const uploadImages = async (files: File[]): Promise<{ urls: string[] }> => {
  const formData = new FormData()
  files.forEach(file => formData.append('images', file))
  
  const response = await fetch(`${API_BASE}/upload/multiple`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  })
  return response.json()
}

export const addCaseImage = async (caseId: string, url: string, alt?: string): Promise<{ url: string }> => {
  const response = await fetch(`${API_BASE}/cases/${caseId}/images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ url, alt })
  })
  return response.json()
}

export const deleteCaseImage = async (caseId: string, imageId: string): Promise<void> => {
  await fetch(`${API_BASE}/cases/${caseId}/images/${imageId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

// 设计师相关 API
export const fetchDesigners = async (): Promise<Designer[]> => {
  const response = await fetch(`${API_BASE}/designers`)
  return response.json()
}

export const fetchDesignerById = async (id: string): Promise<Designer> => {
  const response = await fetch(`${API_BASE}/designers/${id}`)
  if (!response.ok) {
    throw new Error('Designer not found')
  }
  return response.json()
}

export const createDesigner = async (data: Omit<Designer, 'id' | 'casesCount'>): Promise<Designer> => {
  const response = await fetch(`${API_BASE}/designers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data)
  })
  return response.json()
}

export const updateDesigner = async (id: string, data: Partial<Omit<Designer, 'id' | 'casesCount'>>): Promise<Designer> => {
  const response = await fetch(`${API_BASE}/designers/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data)
  })
  return response.json()
}

export const deleteDesigner = async (id: string): Promise<void> => {
  await fetch(`${API_BASE}/designers/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

// 小区相关 API
export const fetchCommunities = async (): Promise<Community[]> => {
  const response = await fetch(`${API_BASE}/communities`)
  return response.json()
}

export const fetchCommunityById = async (id: string): Promise<Community> => {
  const response = await fetch(`${API_BASE}/communities/${id}`)
  if (!response.ok) {
    throw new Error('Community not found')
  }
  return response.json()
}

export const createCommunity = async (data: Omit<Community, 'id' | 'casesCount'>): Promise<Community> => {
  const response = await fetch(`${API_BASE}/communities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data)
  })
  return response.json()
}

export const updateCommunity = async (id: string, data: Partial<Omit<Community, 'id' | 'casesCount'>>): Promise<Community> => {
  const response = await fetch(`${API_BASE}/communities/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data)
  })
  return response.json()
}

export const deleteCommunity = async (id: string): Promise<void> => {
  await fetch(`${API_BASE}/communities/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}
