const express = require("express");
const app = express();
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const userRoute = require("./routes/users");
const authRoute = require("./routes/auth");
const postRoute = require("./routes/posts");
const router = express.Router();
const path = require("path");


dotenv.config();

let dbError = process.env.MONGO_URL ? null : "MONGO_URL is not set";
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    dbError = err.message;
    console.error("MongoDB connection error:", err.message);
  });
app.use("/images", express.static(path.join(__dirname, "public/images")));

//middleware
app.use(express.json());
const port = process.env.PORT || 8800

app.use(helmet());
app.use(morgan("common"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images");
  },
  filename: (req, file, cb) => {
    cb(null, req.body.name);
  },
});

const upload = multer({ storage: storage });
app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    return res.status(200).json("File uploded successfully");
  } catch (error) {
    console.error(error);
  }
});

// Reports whether the database is reachable (no secrets included).
app.get("/api/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const db = states[mongoose.connection.readyState];
  res.status(db === "connected" ? 200 : 503).json({ db, error: dbError });
});

app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/posts", postRoute);

// In production, serve the built React app from the same server.
const clientBuild = path.join(__dirname, "../react-frontend/build");
if (require("fs").existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get("*", (req, res) => res.sendFile(path.join(clientBuild, "index.html")));
}

app.listen(port, () => console.log(`listening on localhost: ${port}`));

