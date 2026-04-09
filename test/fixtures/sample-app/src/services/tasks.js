const Task = require('../models/task')

async function list(userId) {
  return Task.findByUser(userId)
}

async function create(userId, data) {
  if (!data.title || data.title.length < 1) {
    throw new Error('Task title is required')
  }
  return Task.create(userId, data)
}

async function update(id, userId, data) {
  const task = await Task.update(id, userId, data)
  if (!task) {
    throw new Error('Task not found')
  }
  return task
}

async function remove(id, userId) {
  return Task.remove(id, userId)
}

module.exports = { list, create, update, remove }
