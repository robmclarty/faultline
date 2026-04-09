# Abstraction Rules

When extracting knowledge from source code, follow these rules to maintain
the right level of abstraction:

1. **Name concepts, not implementations** — Say "user authentication" not
   "JWT middleware with bcrypt hashing"
2. **Describe behaviors, not code** — Say "users can reset their password"
   not "POST /api/reset calls sendResetEmail()"
3. **Capture constraints, not architecture** — Say "passwords must be at
   least 8 characters" not "validation runs in the controller layer"
4. **Preserve business rules** — If the code enforces specific rules (rate
   limits, ordering, validation), capture those as constraints
5. **Ignore implementation patterns** — Repository pattern, dependency
   injection, etc. are implementation choices, not product specs
