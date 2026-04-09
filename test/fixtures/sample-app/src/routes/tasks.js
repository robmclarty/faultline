const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const taskService = require('../services/tasks')

router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const tasks = await taskService.list(req.user.id)
    res.json(tasks)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const task = await taskService.create(req.user.id, req.body)
    res.status(201).json(task)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const task = await taskService.update(req.params.id, req.user.id, req.body)
    res.json(task)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await taskService.remove(req.params.id, req.user.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

module.exports = router
