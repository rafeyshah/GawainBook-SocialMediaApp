const router = require("express").Router();

// user route
router.get("/", (req, res) => {
    res.send("Hey its user route")
})

module.exports = router