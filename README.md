<p align="center">
  <img src="docs/banner.svg" alt="GawainBook — a social network for book lovers" width="100%">
</p>

<p align="center">
  <a href="https://gawainbook.onrender.com"><strong>Live demo</strong></a> ·
  <a href="#getting-started">Run locally</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React_17-20232A?logo=react&logoColor=61DAFB">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white">
  <img alt="Deployed on Render" src="https://img.shields.io/badge/Deployed_on-Render-46E3B7?logo=render&logoColor=black">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue">
</p>

---

## About

**GawainBook** is a social network for readers. Share what you're reading, post your thoughts and quotes, follow other readers and see what the people you trust are reading next.

It's a full-stack MERN app (MongoDB, Express, React, Node.js), deployed as a single service: the Express API also serves the React app, so the whole thing runs at one URL.

> **Live demo:** https://gawainbook.onrender.com
> Runs on Render's free plan, which sleeps after 15 minutes without visitors. The first load can take 30–60 seconds while it wakes up.

## Screenshots

| Sign in | Create account |
| :---: | :---: |
| <img src="docs/screenshots/sign-in.png" alt="Sign-in page" width="420"> | <img src="docs/screenshots/create-account.png" alt="Create-account page" width="420"> |

## Features

**Accounts**
- Sign up and sign in from a single page, with a smooth switch between the two
- Clear inline errors (wrong password, email already registered, username taken)
- Sign-in emails are case- and whitespace-insensitive; password hashes never leave the server
- Log out from the top bar
- Light and dark themes, remembered per browser

**Social**
- Share posts with text and a photo, with no page reload, a 500-character limit and a live counter near the limit
- A home feed of your posts and posts from people you follow, newest first
- Profile pages with bio, location, join date, and follower and following counts
- Follow and unfollow other readers
- Like and unlike posts; likes update instantly and roll back if the server rejects them
- A sidebar listing the readers you follow
- Loading, empty and error states everywhere, with a retry option

## Roadmap

These features are planned to make GawainBook more book-focused. **None of them are built yet.**

- [ ] Bookshelves: *Want to read*, *Currently reading*, *Read*
- [ ] Book pages with ratings and reviews
- [ ] Quote posts tied to a book and page
- [ ] Reading goals and progress updates
- [ ] Book clubs and group discussions
- [ ] Search for books and readers
- [ ] Image uploads to cloud storage (Cloudinary or S3)
- [ ] Password reset by email
- [ ] Dark mode across the whole app

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 17, React Router 5, Material UI 4 icons, Axios |
| Backend | Node.js, Express 4, Mongoose 5, bcrypt, Helmet, Multer |
| Database | MongoDB Atlas |
| Hosting | Render (single web service, auto-deploys on every push to `master`) |

## Project structure

```
.
├── Node-Rest-API/          Express API (also serves the built React app in production)
│   ├── models/             Mongoose models (User, Post)
│   ├── routes/             /api/auth, /api/users, /api/posts
│   ├── public/images/      Uploaded and default images (served at /images)
│   └── index.js            App entry: DB connection, middleware, routes, /api/health
├── react-frontend/         React app (Create React App)
│   └── src/
│       ├── pages/          auth, home, profile
│       ├── components/     topbar, feed, post, share, sidebar, rightbar…
│       └── context/        Auth state (React context + reducer)
├── docs/                   README banner and screenshots
└── render.yaml             Render deployment blueprint
```

## Getting started

### Prerequisites

- **Node.js 16** for the frontend. It uses `react-scripts` 4, which doesn't run on Node 17 or newer. On a newer Node, use the `npx -p node@16` command below.
- **A MongoDB database.** A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster works.

### 1. Clone

```bash
git clone https://github.com/rafeyshah/GawainBook-SocialMediaApp.git
cd GawainBook-SocialMediaApp
```

### 2. Configure the backend

Copy the example env file and add your MongoDB connection string:

```bash
cp Node-Rest-API/.env.example Node-Rest-API/.env
```

| Variable | Required | Description |
| --- | :---: | --- |
| `MONGO_URL` | ✅ | MongoDB connection string, e.g. `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/gawainbook?retryWrites=true&w=majority` |
| `PORT` | | API port. Defaults to `8800`. |

In Atlas, add your IP address under **Network Access**, or `0.0.0.0/0` for development.

### 3. Start the API

```bash
cd Node-Rest-API
npm install
npm start
```

Check that the database is connected: http://localhost:8800/api/health should return `{"db":"connected"}`.

### 4. Start the frontend

In a second terminal:

```bash
cd react-frontend
npm install --legacy-peer-deps
npx -p node@16 node node_modules/react-scripts/bin/react-scripts.js start
```

Open http://localhost:3000. The dev server forwards `/api` requests to the API on port 8800.

> If you change `proxy` in `react-frontend/package.json`, restart the frontend dev server. It reads that setting only at startup.

## API reference

Every endpoint is under `/api`. Request and response bodies are JSON.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Database connection status |
| `POST` | `/auth/register` | Create an account: `{ username, email, password }` |
| `POST` | `/auth/login` | Sign in: `{ email, password }` |
| `GET` | `/users?username=` or `/users?userId=` | Get a user |
| `PUT` | `/users/:id` | Update a user |
| `DELETE` | `/users/:id` | Delete a user |
| `GET` | `/users/friends/:userId` | List the people a user follows |
| `PUT` | `/users/:id/follow` | Follow a user: `{ userId }` |
| `PUT` | `/users/:id/unfollow` | Unfollow a user: `{ userId }` |
| `POST` | `/posts` | Create a post |
| `PUT` | `/posts/:id` | Update a post |
| `DELETE` | `/posts/:id` | Delete a post |
| `PUT` | `/posts/:id/like` | Like or unlike a post: `{ userId }` → `{ liked, likes }` |
| `GET` | `/posts/:id` | Get a post |
| `GET` | `/posts/timeline/:userId` | A user's feed (their posts plus posts from people they follow) |
| `GET` | `/posts/profile/:username` | A user's posts |
| `POST` | `/upload` | Upload an image (multipart field `file`; PNG, JPG, GIF or WebP, max 5 MB) → `{ filename }` |

## Testing

Both halves of the app have automated tests. They cover success paths, validation, missing and invalid data, permissions, failure handling and the security fixes.

**Backend** (Jest + Supertest against an in-memory MongoDB, so your real database is never touched):

```bash
cd Node-Rest-API
npm test
```

The first run downloads a MongoDB binary (about 500 MB). To use one you already have, set `MONGOMS_SYSTEM_BINARY` to its path.

**Frontend** (Jest + React Testing Library):

```bash
cd react-frontend
npx -p node@16 node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false
```

## Deployment

The app deploys to [Render](https://render.com) using [`render.yaml`](render.yaml). Every push to `master` rebuilds the React app and redeploys it together with the API.

**One-time setup**
1. In MongoDB Atlas → **Network Access**, allow `0.0.0.0/0`. Render's outbound IP addresses aren't fixed.
2. In Render, choose **New → Blueprint** and select this repository.
3. Enter `MONGO_URL` when prompted.
4. After the first deploy, open `/api/health` and check for `"db":"connected"`.

**Known limitations on the free plan**
- Uploaded images are saved to the server's disk, which Render wipes on every deploy and restart. Cloud storage is on the roadmap.
- The service sleeps when idle, so the first request afterwards is slow.

## Contributing

Contributions are welcome.

1. Fork the repo and create a branch: `git checkout -b feature/my-change`
2. Commit your changes with a clear message.
3. Open a pull request describing what changed and why.

For larger changes, please open an issue first to discuss the approach.

## License

Released under the [MIT License](https://choosealicense.com/licenses/mit/).
