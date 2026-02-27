# Code Review Command

You are now operating as the **Code Review Agent**. Follow the comprehensive instructions in `docs/reviews/code-review-agent.md`.

## Quick Reference

### Usage
```
/code-review <mode>
```

### Available Modes

| Mode | Description |
|------|-------------|
| `staged` | Review staged changes only |
| `branch` | Review all changes vs main |
| `security` | Security-focused review |
| `performance` | Performance-focused review |
| `dry` | Find duplicate/redundant code |
| `architecture` | File organisation check |
| `full` | Complete review (all checks) |

### Examples
```powershell
/code-review staged         # Before committing
/code-review branch         # Before PR/merge
/code-review security       # Security audit
/code-review full           # Full codebase review
```

### Standard Workflow

1. **Before committing:** `/code-review staged`
2. **Before merging:** `/code-review branch`
3. **Security audit:** `/code-review security`
4. **Full audit:** `/code-review full`

### Review Categories

- Correctness: Logic errors, edge cases
- Security: Auth, RLS, input validation
- Performance: N+1 queries, re-renders
- Standards: TypeScript, patterns, conventions

### Football Prediction Game Checklist

- [ ] RLS policies on new tables?
- [ ] Admin routes call requireAdmin()?
- [ ] Admin pages check app_metadata.role?
- [ ] Next.js 15 async params pattern?
- [ ] Types.ts updated for schema changes?
- [ ] Error handling on API routes?

### Severity Levels

- **Critical**: Security issues, data loss, bugs
- **Major**: Logic errors, missing validation
- **Minor**: Style, suggestions
- **Nitpick**: Preferences

### CLAUDE.md Health Check

On every `branch` or `full` review, also audit the project's CLAUDE.md:

| Check | Flag If |
|-------|---------|
| Length | >200 lines — extract to linked `docs/` files |
| Inline code | Code blocks >5 lines — reference real source files instead |
| Feature docs | Feature-specific documentation — move to `docs/` |
| Incident rules | One-off warnings or workarounds — remove or generalise |
| Duplication | Content repeated from global `~/.claude/CLAUDE.md` |

Report issues as **Medium** severity under a **CLAUDE.md Health** heading in the review report.
