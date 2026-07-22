import express from 'express'
import {
  getAllCommunities,
  getCommunityById,
  createCommunity,
  updateCommunity,
  deleteCommunity,
  getCommunityCasesCount
} from '../services/communityService'

const router = express.Router()

router.get('/', (req, res) => {
  const communities = getAllCommunities()
  const communitiesWithCount = communities.map(c => ({
    ...c,
    casesCount: getCommunityCasesCount(c.name)
  }))
  res.json(communitiesWithCount)
})

router.get('/:id', (req, res) => {
  const community = getCommunityById(req.params.id)
  if (!community) {
    return res.status(404).json({ error: 'Community not found' })
  }
  res.json(community)
})

router.post('/', (req, res) => {
  const { name, sortOrder, showOnHome, coverImage, description } = req.body
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' })
  }
  
  const newCommunity = createCommunity({
    name,
    sortOrder: sortOrder || 0,
    showOnHome: showOnHome !== false,
    coverImage: coverImage || '',
    description: description || ''
  })
  
  res.status(201).json(newCommunity)
})

router.put('/:id', (req, res) => {
  const { name, sortOrder, showOnHome, coverImage, description } = req.body
  
  const updatedCommunity = updateCommunity(req.params.id, {
    name,
    sortOrder,
    showOnHome,
    coverImage,
    description
  })
  
  if (!updatedCommunity) {
    return res.status(404).json({ error: 'Community not found' })
  }
  
  res.json(updatedCommunity)
})

router.delete('/:id', (req, res) => {
  const community = getCommunityById(req.params.id)
  if (!community) {
    return res.status(404).json({ error: 'Community not found' })
  }
  
  const casesCount = getCommunityCasesCount(community.name)
  if (casesCount > 0) {
    return res.status(400).json({ 
      error: 'Cannot delete community with existing cases',
      casesCount 
    })
  }
  
  const deleted = deleteCommunity(req.params.id)
  if (!deleted) {
    return res.status(404).json({ error: 'Community not found' })
  }
  
  res.json({ message: 'Community deleted successfully' })
})

export default router
