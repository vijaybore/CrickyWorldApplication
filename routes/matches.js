const express = require('express')
const router  = express.Router()
const Match   = require('../models/Match')
const auth    = require('../middleware/auth')

// All routes require authentication — user MUST be logged in
// Every query is filtered by createdBy: req.user.id so users only see their own data

// ── GET /api/matches ──────────────────────────────────────────────────────────
// Returns ONLY the logged-in user's matches
router.get('/', auth, async (req, res) => {
  try {
    const matches = await Match.find({ createdBy: req.user.id }).sort({ createdAt: -1 })
    res.json(matches)
  } catch (err) {
    console.error('GET /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
// Returns a single match — only if it belongs to this user
router.get('/:id', auth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, createdBy: req.user.id })
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches ─────────────────────────────────────────────────────────
// Creates a new match tagged to this user
router.post('/', auth, async (req, res) => {
  try {
    const match = new Match({ ...req.body, createdBy: req.user.id })
    await match.save()
    res.status(201).json(match)
  } catch (err) {
    console.error('POST /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PUT /api/matches/:id ──────────────────────────────────────────────────────
// Updates a match — only if it belongs to this user
router.put('/:id', auth, async (req, res) => {
  try {
    const match = await Match.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      { ...req.body, createdBy: req.user.id }, // prevent createdBy being overwritten
      { new: true, runValidators: true }
    )
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    console.error('PUT /matches/:id error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/matches/:id ───────────────────────────────────────────────────
// Deletes a match — only if it belongs to this user
router.delete('/:id', auth, async (req, res) => {
  try {
    const match = await Match.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id })
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json({ message: 'Match deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
