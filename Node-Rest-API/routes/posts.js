const router = require("express").Router();
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");

const MAX_DESC = 500;
const isId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const newestFirst = { createdAt: -1 };

const serverError = (res, err) => {
  console.error(err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
};

// Loads the post or responds 404. Returns null when a response was sent.
const findPost = async (req, res) => {
  const post = isId(req.params.id) ? await Post.findById(req.params.id) : null;
  if (!post) res.status(404).json({ error: "Post not found." });
  return post;
};

//create a post
router.post("/", async (req, res) => {
  const userId = req.body.userId;
  const desc = String(req.body.desc || "").trim();
  const img = req.body.img ? String(req.body.img) : undefined;

  if (!isId(userId)) return res.status(400).json({ error: "userId is required." });
  if (!desc && !img) return res.status(400).json({ error: "Write something or add a photo." });
  if (desc.length > MAX_DESC) {
    return res.status(400).json({ error: `Posts can be at most ${MAX_DESC} characters.` });
  }
  if (img && !/^[\w.-]+$/.test(img)) return res.status(400).json({ error: "Invalid image." });

  try {
    if (!(await User.exists({ _id: userId }))) return res.status(404).json({ error: "User not found." });
    const post = await new Post({ userId, desc, img }).save();
    return res.status(201).json(post);
  } catch (err) {
    return serverError(res, err);
  }
});

//update a post (text only)
router.put("/:id", async (req, res) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    if (post.userId !== req.body.userId) {
      return res.status(403).json({ error: "You can only edit your own posts." });
    }
    const desc = String(req.body.desc || "").trim();
    if (!desc && !post.img) return res.status(400).json({ error: "Write something or add a photo." });
    if (desc.length > MAX_DESC) {
      return res.status(400).json({ error: `Posts can be at most ${MAX_DESC} characters.` });
    }
    post.desc = desc;
    await post.save();
    return res.status(200).json(post);
  } catch (err) {
    return serverError(res, err);
  }
});

//delete a post
router.delete("/:id", async (req, res) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    if (post.userId !== req.body.userId) {
      return res.status(403).json({ error: "You can only delete your own posts." });
    }
    await post.deleteOne();
    return res.status(200).json({ message: "Post deleted." });
  } catch (err) {
    return serverError(res, err);
  }
});

//like / unlike a post. Responds with the new like state.
router.put("/:id/like", async (req, res) => {
  const userId = req.body.userId;
  if (!isId(userId)) return res.status(400).json({ error: "userId is required." });
  try {
    const post = await findPost(req, res);
    if (!post) return;
    const liked = !post.likes.map(String).includes(String(userId));
    const updated = await Post.findByIdAndUpdate(
      post._id,
      liked ? { $addToSet: { likes: userId } } : { $pull: { likes: userId } },
      { new: true }
    );
    return res.status(200).json({ liked, likes: updated.likes.length });
  } catch (err) {
    return serverError(res, err);
  }
});

//get a post
router.get("/:id", async (req, res) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    return res.status(200).json(post);
  } catch (err) {
    return serverError(res, err);
  }
});

//timeline: the user's posts plus posts from people they follow, newest first
router.get("/timeline/:userId", async (req, res) => {
  if (!isId(req.params.userId)) return res.status(404).json({ error: "User not found." });
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    const authors = [String(user._id), ...user.followings.map(String)];
    const posts = await Post.find({ userId: { $in: authors } }).sort(newestFirst);
    return res.status(200).json(posts);
  } catch (err) {
    return serverError(res, err);
  }
});

//all posts by a user, newest first
router.get("/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: "User not found." });
    const posts = await Post.find({ userId: String(user._id) }).sort(newestFirst);
    return res.status(200).json(posts);
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
