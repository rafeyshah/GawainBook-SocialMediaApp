const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");

// Never send the password hash to the client.
const publicUser = (user) => {
  const { password, ...rest } = user._doc;
  return rest;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

//REGISTER
router.post("/register", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: "Username must be 3–20 characters." });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await new User({ username, email, password: hashedPassword }).save();
    return res.status(201).json(publicUser(user));
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "account";
      const message =
        field === "email"
          ? "An account with this email already exists. Try signing in."
          : field === "username"
          ? "That username is taken. Please choose another."
          : "An account with these details already exists.";
      return res.status(409).json({ error: message });
    }
    console.error(err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

//LOGIN
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: normalizeEmail(req.body.email) });
    // Same message for unknown email and wrong password, so the form
    // doesn't reveal which emails are registered.
    const valid = user && (await bcrypt.compare(String(req.body.password || ""), user.password));
    if (!valid) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    return res.status(200).json(publicUser(user));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
