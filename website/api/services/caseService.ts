import db, { Case, CaseImage } from '../database/db'

export const getAllCases = (): Case[] => {
  return db.data.cases
}

export const getCaseById = (id: string): Case | undefined => {
  return db.data.cases.find(c => c.id === id)
}

export const getCasesByCommunity = (community: string): Case[] => {
  return db.data.cases.filter(c => c.community === community)
}

export const getCommunities = (): string[] => {
  const communities = new Set(db.data.cases.map(c => c.community))
  return Array.from(communities)
}

export const createCase = (data: Omit<Case, 'id' | 'images' | 'createdAt' | 'updatedAt'>): Case => {
  const newCase: Case = {
    ...data,
    id: Date.now().toString(),
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  db.data.cases.push(newCase)
  db.write()
  return newCase
}

export const updateCase = (id: string, data: Partial<Omit<Case, 'id' | 'images' | 'createdAt'>>): Case | undefined => {
  const index = db.data.cases.findIndex(c => c.id === id)
  if (index === -1) return undefined
  
  db.data.cases[index] = {
    ...db.data.cases[index],
    ...data,
    updatedAt: new Date().toISOString()
  }
  db.write()
  return db.data.cases[index]
}

export const deleteCase = (id: string): boolean => {
  const initialLength = db.data.cases.length
  db.data.cases = db.data.cases.filter(c => c.id !== id)
  db.write()
  return db.data.cases.length < initialLength
}

export const addCaseImage = (caseId: string, url: string, alt: string = ''): CaseImage | undefined => {
  const caseItem = db.data.cases.find(c => c.id === caseId)
  if (!caseItem) return undefined
  
  const newImage: CaseImage = {
    id: Date.now().toString(),
    caseId,
    url,
    order: caseItem.images.length,
    alt
  }
  caseItem.images.push(newImage)
  caseItem.updatedAt = new Date().toISOString()
  db.write()
  return newImage
}

export const updateCaseImage = (caseId: string, imageId: string, data: Partial<CaseImage>): CaseImage | undefined => {
  const caseItem = db.data.cases.find(c => c.id === caseId)
  if (!caseItem) return undefined
  
  const imageIndex = caseItem.images.findIndex(i => i.id === imageId)
  if (imageIndex === -1) return undefined
  
  caseItem.images[imageIndex] = {
    ...caseItem.images[imageIndex],
    ...data
  }
  caseItem.updatedAt = new Date().toISOString()
  db.write()
  return caseItem.images[imageIndex]
}

export const deleteCaseImage = (caseId: string, imageId: string): boolean => {
  const caseItem = db.data.cases.find(c => c.id === caseId)
  if (!caseItem) return false
  
  const initialLength = caseItem.images.length
  caseItem.images = caseItem.images.filter(i => i.id !== imageId)
  caseItem.images.forEach((img, idx) => {
    img.order = idx
  })
  caseItem.updatedAt = new Date().toISOString()
  db.write()
  return caseItem.images.length < initialLength
}
