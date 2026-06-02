// GET /api/players — only this user's players
router.get('/', auth, async (req, res) => {
  try {
    const players = await Player.find({ createdBy: req.user.id })
    res.json(players)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/players — tag player with user
router.post('/', auth, async (req, res) => {
  try {
    const player = new Player({
      ...req.body,
      createdBy: req.user.id,
    })
    await player.save()
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})
