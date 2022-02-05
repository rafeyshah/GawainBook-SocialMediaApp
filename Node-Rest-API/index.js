const express = require("express");
const mongoose = require("mongoose");
// Use to hide credentials of mongodb
const dotenv = require("dotenv");
// Use to hide header of requests
const helmet = require("helmet")
// Logging Middleware
const morgan = require("morgan");
const userRoute = require("./routes/users");
const authRoute = require("./routes/auth");
const postRoute = require("./routes/posts");


const app = express();

// .env to start working
dotenv.config();

mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true}, ()=>{
    console.log("Connected to Database")
})

// Middlewares
app.use(express.json());
app.use(helmet());
app.use(morgan("common"));
app.use("/api/users", userRoute);
app.use("/api/auth", authRoute);
app.use("/api/posts", postRoute);




app.listen(8800, () =>{
    console.log("Backend Server is Ready")
})