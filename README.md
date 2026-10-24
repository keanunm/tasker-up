# ⚡ Tasker Up! — Smart Conversational Task & Project Manager

A sleek, responsive task and project management web application featuring conversational quick-entry, project folders, customizable categories, and local browser persistence.

---

## 🚀 Live Demo & GitHub Pages Hosting (`.github.io`)

Once pushed to your GitHub repository, this project deploys automatically to **GitHub Pages**:

```
https://<your-username>.github.io/<repository-name>/
```

### How to Publish to GitHub Pages:
1. Create a new repository on GitHub (e.g. `tasker-up` or `<your-username>.github.io`).
2. Run the following commands in this directory:
   ```bash
   git add .
   git commit -m "Initial commit of Tasker Up"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
3. In your GitHub repository:
   - Go to **Settings** &rarr; **Pages**.
   - Under **Build and deployment** &rarr; **Source**, select **GitHub Actions** (or select **Deploy from a branch** &rarr; `main` &rarr; `/ (root)`).
4. GitHub Pages will build and deploy your site to `https://<your-username>.github.io/<your-repo-name>/`!

---

## ✨ Features

- **Conversational Task Entry**: Type naturally with tags:
  - `#category` (e.g., `#Work`, `#Design`) — tags or automatically creates categories.
  - `@folder` (e.g., `@ClientAlpha`, `@"Website Redesign"`) — files into project folders.
  - `!urgent`, `!high`, `!medium`, `!low` — assigns priority.
  - `^today`, `^tomorrow`, `^YYYY-MM-DD` — schedules due dates.
- **Project Folders**: Organize tasks into dedicated folders/projects with custom icons and color themes.
- **Custom Categories**: Create and manage categories with preset color swatches and icons.
- **Voice Dictation**: Built-in speech-to-text with Web Speech API.
- **Audio Feedback**: Pleasant Web Audio API feedback for task completion and actions (with a sound toggle).
- **Offline / Local Persistence**: Automatically saves to browser `localStorage` with JSON export/import options.
- **Pure Web Stack**: Vanilla HTML5, CSS3, and JavaScript — no build steps or heavy node dependencies needed.

---

## 🛠️ Local Development

Open `index.html` directly in your browser, or start a local static server:

```bash
# Python 3
python -m http.server 5173

# Or npx
npx serve .
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
