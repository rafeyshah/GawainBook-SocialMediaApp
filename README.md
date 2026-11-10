![Logo](GawainBook2.png)

# Gawain Book
![](https://img.shields.io/github/last-commit/rafeyshah/GawainBook-SocialMediaApp)

Gawain Book is a social media app where users connect with friends. It works like a virtual photo album, combining ideas from Instagram and Facebook.

## Live Preview
[gawainbook.onrender.com](https://gawainbook.onrender.com/)

Hosted on Render's free plan: after about 15 minutes without visitors the app sleeps, so the first visit can take 30–60 seconds to load.

## Demo Video
https://www.loom.com/share/ed2927f5585f4641b3a7eda3366de4ce

## Functionalities
- Sign in, sign out and registration
- Create a post (text with image)
- News feed with your posts and your friends' posts
- Your profile with your bio and posts
- Friends' profiles with their posts
- Follow and unfollow people
- Like and unlike posts
- Your follow list and your friends' follow lists

## Technologies
- MongoDB, Express.js, React, Node.js

## Project Structure
```
Node-Rest-API/    Express + MongoDB backend (API under /api, images under /images)
react-frontend/   React app (Create React App)
render.yaml       Render deployment config
```

In production the backend also serves the built React app, so everything runs as one service at one URL.

## Running Locally

### Requirements
- Node.js. The frontend uses `react-scripts` 4, which only runs on **Node 16**. With a newer Node installed, use the `npx -p node@16` commands below.
- A MongoDB database, for example a free cluster on [MongoDB Atlas](https://cloud.mongodb.com/).

### Backend
1. In Atlas, open your cluster → **Connect** → **Drivers** and copy the connection string.
2. Copy `Node-Rest-API/.env.example` to `Node-Rest-API/.env` and fill in your connection string:
   ```
   MONGO_URL = mongodb+srv://<user>:<password>@<cluster>.mongodb.net/gawainbook?retryWrites=true&w=majority
   ```
3. Start the API on http://localhost:8800:
   ```bash
   cd Node-Rest-API
   npm install
   npm start
   ```
4. Check the database connection at http://localhost:8800/api/health. It should show `"db":"connected"`.

### Frontend
```bash
cd react-frontend
npm install --legacy-peer-deps
npx -p node@16 node node_modules/react-scripts/bin/react-scripts.js start
```
The app opens at http://localhost:3000 and forwards API requests to the backend on port 8800.

## Deployment
The app deploys to [Render](https://render.com) using `render.yaml`. Every push to `master` rebuilds and redeploys the frontend and backend together.

One-time setup:
1. In MongoDB Atlas, go to **Network Access** and allow `0.0.0.0/0`, because Render's IP addresses change.
2. On Render, choose **New → Blueprint** and select this repository.
3. When prompted, enter your `MONGO_URL`.

After deploying, open `/api/health` on the live site to confirm the database is connected.

Note: uploaded images are stored on the server's disk, which Render's free plan wipes on every deploy and restart.

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
[MIT](https://choosealicense.com/licenses/mit/)
