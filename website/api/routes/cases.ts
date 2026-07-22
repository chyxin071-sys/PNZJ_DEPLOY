import express from 'express'
import {
  getAllCases,
  getCaseById,
  getCasesByCommunity,
  getCommunities,
  createCase,
  updateCase,
  deleteCase,
  addCaseImage,
  updateCaseImage,
  deleteCaseImage
} from '../services/caseService'

const router = express.Router()

router.get('/', (req, res) => {
  const { community } = req.query
  if (community) {
    const cases = getCasesByCommunity(community as string)
    res.json(cases)
  } else {
    const cases = getAllCases()
    res.json(cases)
  }
})

router.get('/communities', (req, res) => {
  const communities = getCommunities()
  res.json(communities)
})

router.get('/:id', (req, res) => {
  const caseItem = getCaseById(req.params.id)
  if (!caseItem) {
    return res.status(404).json({ error: 'Case not found' })
  }
  res.json(caseItem)
})

router.post('/', (req, res) => {
  const { name, community, houseType, style, area, description, coverImage, featured, sortOrder, status, designerId } = req.body
  
  if (!name || !community || !houseType || !style) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  
  const newCase = createCase({
    name,
    community,
    houseType,
    style,
    area: area || 0,
    description: description || '',
    coverImage: coverImage || '',
    featured: featured || false,
    sortOrder: sortOrder || 0,
    status: status || 'draft',
    designerId: designerId || ''
  })
  
  res.status(201).json(newCase)
})

router.put('/:id', (req, res) => {
  const { name, community, houseType, style, area, description, coverImage, featured, sortOrder, status, designerId } = req.body
  
  const updatedCase = updateCase(req.params.id, {
    name,
    community,
    houseType,
    style,
    area,
    description,
    coverImage,
    featured,
    sortOrder,
    status,
    designerId
  })
  
  if (!updatedCase) {
    return res.status(404).json({ error: 'Case not found' })
  }
  
  res.json(updatedCase)
})

router.delete('/:id', (req, res) => {
  const deleted = deleteCase(req.params.id)
  if (!deleted) {
    return res.status(404).json({ error: 'Case not found' })
  }
  res.json({ message: 'Case deleted successfully' })
})

router.post('/:id/images', (req, res) => {
  const { url, alt } = req.body
  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }
  
  const newImage = addCaseImage(req.params.id, url, alt)
  if (!newImage) {
    return res.status(404).json({ error: 'Case not found' })
  }
  
  res.status(201).json(newImage)
})

router.put('/:id/images/:imageId', (req, res) => {
  const { url, alt, order } = req.body
  
  const updatedImage = updateCaseImage(req.params.id, req.params.imageId, {
    url,
    alt,
    order
  })
  
  if (!updatedImage) {
    return res.status(404).json({ error: 'Image not found' })
  }
  
  res.json(updatedImage)
})

router.delete('/:id/images/:imageId', (req, res) => {
  const deleted = deleteCaseImage(req.params.id, req.params.imageId)
  if (!deleted) {
    return res.status(404).json({ error: 'Image not found' })
  }
  res.json({ message: 'Image deleted successfully' })
})

export default router
