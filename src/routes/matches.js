// GET /api/matches — return ONLY this user's matches
router.get('/', auth, async (req, res) => {
  try {
    const matches = await Match.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
    res.json(matches)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/matches — tag new match with this user
router.post('/', auth, async (req, res) => {
  try {
    const match = new Match({
      ...req.body,
      createdBy: req.user.id,   // ← the key line
    })
    await match.save()
    res.json(match)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})
