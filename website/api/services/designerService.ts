import db, { Designer } from '../database/db'

export const getAllDesigners = (): Designer[] => {
  return db.data.designers
}

export const getDesignerById = (id: string): Designer | undefined => {
  return db.data.designers.find(d => d.id === id)
}

export const createDesigner = (data: Omit<Designer, 'id' | 'createdAt' | 'updatedAt'>): Designer => {
  const newDesigner: Designer = {
    ...data,
    id: `d${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  db.data.designers.push(newDesigner)
  db.write()
  return newDesigner
}

export const updateDesigner = (id: string, data: Partial<Omit<Designer, 'id' | 'createdAt'>>): Designer | undefined => {
  const index = db.data.designers.findIndex(d => d.id === id)
  if (index === -1) return undefined
  
  db.data.designers[index] = {
    ...db.data.designers[index],
    ...data,
    updatedAt: new Date().toISOString()
  }
  db.write()
  return db.data.designers[index]
}

export const deleteDesigner = (id: string): boolean => {
  const initialLength = db.data.designers.length
  db.data.designers = db.data.designers.filter(d => d.id !== id)
  db.write()
  return db.data.designers.length < initialLength
}

export const getDesignerCasesCount = (designerId: string): number => {
  return db.data.cases.filter(c => c.designerId === designerId).length
}
