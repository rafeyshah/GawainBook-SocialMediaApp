const router = require("express").Router();
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../models/User");

const isId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

// Fields other people may see. Never includes password, email or admin flags.
const publicProfile = (user) => ({
  _id: user._id,
  username: user.username,
  profilePicture: user.profilePicture,
  coverPicture: user.coverPicture,
  followers: user.followers,
  followings: user.followings,
  desc: user.desc,
  city: user.city,
  from: user.from,
  relationship: user.relationship,
  createdAt: user.createdAt,
});

// Fields a user may change on their own account.
const EDITABLE = ["desc", "city", "from", "relationship", "profilePicture", "coverPicture"];

const serverError = (res, err) => {
  console.error(err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
};

//update user
router.put("/:id", async (req, res) => {
  if (req.body.userId !== req.params.id) {
    return res.status(403).json({ error: "You can only update your own account." });
  }
  if (!isId(req.params.id)) return res.status(404).json({ error: "User not found." });

  const update = {};
  for (const key of EDITABLE) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  if (req.body.password !== undefined) {
    if (String(req.body.password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    update.password = await bcrypt.hash(String(req.body.password), 10);
  }

  try {
    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.status(200).json(publicProfile(user));
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    return serverError(res, err);
  }
});

//delete user
router.delete("/:id", async (req, res) => {
  if (req.body.userId !== req.params.id) {
    return res.status(403).json({ error: "You can only delete your own account." });
  }
  if (!isId(req.params.id)) return res.status(404).json({ error: "User not found." });
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    // Remove them from everyone's follower/following lists.
    await User.updateMany({}, { $pull: { followers: req.params.id, followings: req.params.id } });
    return res.status(200).json({ message: "Account deleted." });
  } catch (err) {
    return serverError(res, err);
  }
});

//get a user (by ?userId= or ?username=)
router.get("/", async (req, res) => {
  const { userId, username } = req.query;
  try {
    let user = null;
    if (userId) user = isId(userId) ? await User.findById(userId) : null;
    else if (username) user = await User.findOne({ username: String(username) });
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.status(200).json(publicProfile(user));
  } catch (err) {
    return serverError(res, err);
  }
});

//get the people a user follows
router.get("/friends/:userId", async (req, res) => {
  if (!isId(req.params.userId)) return res.status(404).json({ error: "User not found." });
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    const friends = await User.find(
      { _id: { $in: user.followings.filter(isId) } },
      { username: 1, profilePicture: 1 }
    );
    return res.status(200).json(
      friends.map((f) => ({ _id: f._id, username: f.username, profilePicture: f.profilePicture }))
    );
  } catch (err) {
    return serverError(res, err);
  }
});

const followHandler = (follow) => async (req, res) => {
  const targetId = req.params.id;
  const meId = req.body.userId;
  if (!isId(meId)) return res.status(400).json({ error: "userId is required." });
  if (meId === targetId) {
    return res.status(403).json({ error: follow ? "You can't follow yourself." : "You can't unfollow yourself." });
  }
  if (!isId(targetId)) return res.status(404).json({ error: "User not found." });
  try {
    const [target, me] = await Promise.all([User.findById(targetId), User.findById(meId)]);
    if (!target || !me) return res.status(404).json({ error: "User not found." });

    const already = target.followers.map(String).includes(String(meId));
    if (follow && already) return res.status(409).json({ error: "You already follow this reader." });
    if (!follow && !already) return res.status(409).json({ error: "You don't follow this reader." });

    const op = follow ? "$addToSet" : "$pull";
    await Promise.all([
      target.updateOne({ [op]: { followers: meId } }),
      me.updateOne({ [op]: { followings: targetId } }),
    ]);
    return res.status(200).json({ following: follow });
  } catch (err) {
    return serverError(res, err);
  }
};

router.put("/:id/follow", followHandler(true));
router.put("/:id/unfollow", followHandler(false));

module.exports = router;
