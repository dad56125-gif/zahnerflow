# AGENTS.md
# Language
- **Chinese.** The default language shall be used for searching and thinking, and Chinese shall be used for replies.

### Core Rule
- All API parameters, interface definitions, and variable names must uniformly use **snake_case**.
- The use of camelCase for naming is prohibited; non-compliant code will not be accepted.

### Other Rule
- Use the backend Python script as the naming source, ensuring it is fully consistent with the device API.
- The parameter names in the frontend, backend, and Python script must be fully aligned.
- Before adding or modifying a parameter name, check the Parametername.md file in the root directory.
- After adding or modifying a parameter name, update the Parametername.md file in the root directory.
- Independently refer to the Realme.md documents in the doc/ directory of different modules as needed. While these documents may not be completely accurate, they can provide useful guidance.