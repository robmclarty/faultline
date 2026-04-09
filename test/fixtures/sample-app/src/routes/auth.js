const express = require('express')
const router = express.Router()
const { register, login } = require('../services/auth')

router.post('/register', async (req, res, next) => {
  try {
    const user = await register(req.body)
    res.status(201).json(user)
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const token = await login(req.body.email, req.body.password)
    res.json({ token })
  } catch (err) {
    next(err)
  }
})

module.exports = router
