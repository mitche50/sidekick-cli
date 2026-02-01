# GitHub setup (optional)

If you want to keep this folder versioned in GitHub:

```bash
git init
git add .
git commit -m "Initial Claude skills repo"

# Create an empty repo on GitHub, then:
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

Tip: If you clone the repo directly into `~/.claude/skills`, your personal skills are automatically available across all projects in Claude Code.
