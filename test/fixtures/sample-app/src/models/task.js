const db = require('../utils/db')

const Task = {
  async findByUser(userId) {
    const result = await db.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    return result.rows
  },

  async create(userId, { title, description }) {
    const result = await db.query(
      'INSERT INTO tasks (user_id, title, description) VALUES ($1, $2, $3) RETURNING *',
      [userId, title, description]
    )
    return result.rows[0]
  },

  async update(id, userId, updates) {
    const result = await db.query(
      'UPDATE tasks SET title = $1, description = $2, completed = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
      [updates.title, updates.description, updates.completed, id, userId]
    )
    return result.rows[0]
  },

  async remove(id, userId) {
    await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId])
  }
}

module.exports = Task
