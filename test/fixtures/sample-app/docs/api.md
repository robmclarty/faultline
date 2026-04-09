# API Documentation

## Authentication

### POST /auth/register

Register a new user account.

**Request Body:**

- `email` — User email address
- `password` — User password (min 8 characters)
- `name` — User display name

### POST /auth/login

Authenticate and receive a JWT token.

**Request Body:**

- `email` — User email
- `password` — User password

## Tasks

All task endpoints require authentication via Bearer token.

### GET /tasks

List all tasks for the authenticated user.

### POST /tasks

Create a new task.

### PUT /tasks/:id

Update an existing task.

### DELETE /tasks/:id

Delete a task.
