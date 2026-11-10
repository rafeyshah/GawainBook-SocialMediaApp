const dotenv = require("dotenv");
dotenv.config();

const app = require("./app");
const db = require("./db");

const port = process.env.PORT || 8800;

db.connect(process.env.MONGO_URL);
app.listen(port, () => console.log(`listening on localhost: ${port}`));
