const db = require('../utils/db')

const User = {
  async findByEmail(email) {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email])
    return result.rows[0]
  },

  async create({ email, password_hash, name }) {
    const result = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
      [email, password_hash, name]
    )
    return result.rows[0]
  },

  async findById(id) {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0]
  }
}

module.exports = User
