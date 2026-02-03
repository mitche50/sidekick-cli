# GitHub setup (optional)

If you want to keep this folder versioned in GitHub:

```bash
git init
git add .
git commit -m "Initial agent skills repo"

# Create an empty repo on GitHub, then:
git branch -M main
git remote add origin https://github.com/mitche50/sidekick-cli
git push -u origin main
```

Tip: If you clone the repo directly into `~/.agents/skills`, your personal skills are automatically available across all projects that support `SKILL.md` discovery.
