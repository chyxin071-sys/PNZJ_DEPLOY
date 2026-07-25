import db, { Community } from '../database/db'

export const getAllCommunities = (): Community[] => {
  return [...db.data.communities].sort((a, b) => a.sortOrder - b.sortOrder)
}

export const getCommunityById = (id: string): Community | undefined => {
  return db.data.communities.find(c => c.id === id)
}

export const createCommunity = (data: Omit<Community, 'id' | 'createdAt' | 'updatedAt'>): Community => {
  const maxSortOrder = db.data.communities.reduce((max, c) => Math.max(max, c.sortOrder), 0)
  const newCommunity: Community = {
    ...data,
    id: `c${Date.now()}`,
    sortOrder: data.sortOrder || maxSortOrder + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  db.data.communities.push(newCommunity)
  db.write()
  return newCommunity
}

export const updateCommunity = (id: string, data: Partial<Omit<Community, 'id' | 'createdAt'>>): Community | undefined => {
  const index = db.data.communities.findIndex(c => c.id === id)
  if (index === -1) return undefined
  
  db.data.communities[index] = {
    ...db.data.communities[index],
    ...data,
    updatedAt: new Date().toISOString()
  }
  db.write()
  return db.data.communities[index]
}

export const deleteCommunity = (id: string): boolean => {
  const initialLength = db.data.communities.length
  db.data.communities = db.data.communities.filter(c => c.id !== id)
  db.write()
  return db.data.communities.length < initialLength
}

export const getCommunityCasesCount = (communityName: string): number => {
  return db.data.cases.filter(c => c.community === communityName).length
}
