import express from 'express'
import {
  getAllDesigners,
  getDesignerById,
  createDesigner,
  updateDesigner,
  deleteDesigner,
  getDesignerCasesCount
} from '../services/designerService'

const router = express.Router()

router.get('/', (req, res) => {
  const designers = getAllDesigners()
  // 为每个设计师添加案例数量
  const designersWithCount = designers.map(d => ({
    ...d,
    casesCount: getDesignerCasesCount(d.id)
  }))
  res.json(designersWithCount)
})

router.get('/:id', (req, res) => {
  const designer = getDesignerById(req.params.id)
  if (!designer) {
    return res.status(404).json({ error: 'Designer not found' })
  }
  res.json(designer)
})

router.post('/', (req, res) => {
  const { name, avatar, bio, phone, email } = req.body
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' })
  }
  
  const newDesigner = createDesigner({
    name,
    avatar: avatar || '',
    bio: bio || '',
    phone: phone || '',
    email: email || ''
  })
  
  res.status(201).json(newDesigner)
})

router.put('/:id', (req, res) => {
  const { name, avatar, bio, phone, email } = req.body
  
  const updatedDesigner = updateDesigner(req.params.id, {
    name,
    avatar,
    bio,
    phone,
    email
  })
  
  if (!updatedDesigner) {
    return res.status(404).json({ error: 'Designer not found' })
  }
  
  res.json(updatedDesigner)
})

router.delete('/:id', (req, res) => {
  // 检查是否有案例使用该设计师
  const casesCount = getDesignerCasesCount(req.params.id)
  if (casesCount > 0) {
    return res.status(400).json({ 
      error: 'Cannot delete designer with existing cases',
      casesCount 
    })
  }
  
  const deleted = deleteDesigner(req.params.id)
  if (!deleted) {
    return res.status(404).json({ error: 'Designer not found' })
  }
  
  res.json({ message: 'Designer deleted successfully' })
})

export default router
