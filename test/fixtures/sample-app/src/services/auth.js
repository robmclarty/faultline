const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const User = require('../models/user')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const SALT_ROUNDS = 10

async function register({ email, password, name }) {
  const existing = await User.findByEmail(email)
  if (existing) {
    throw new Error('Email already registered')
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await User.create({ email, password_hash, name })

  return { id: user.id, email: user.email, name: user.name }
}

async function login(email, password) {
  const user = await User.findByEmail(email)
  if (!user) {
    throw new Error('Invalid credentials')
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    throw new Error('Invalid credentials')
  }

  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '24h'
  })
}

module.exports = { register, login }
