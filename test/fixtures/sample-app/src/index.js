const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')
const taskRoutes = require('./routes/tasks')
const { errorHandler } = require('./middleware/error')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.use('/auth', authRoutes)
app.use('/tasks', taskRoutes)

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

module.exports = app
