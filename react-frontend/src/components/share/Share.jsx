import { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ImageOutlined, Close } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import Avatar from "../avatar/Avatar";
import "./share.css";

export const MAX_LENGTH = 500;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// Composer for a new post. Calls onPosted(post) after it's saved.
export default function Share({ onPosted }) {
  const { user } = useContext(AuthContext);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const fileInput = useRef();

  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_LENGTH;
  const canPost = (trimmed || file) && !tooLong && !posting;

  const chooseFile = (e) => {
    const chosen = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!chosen) return;
    if (!IMAGE_TYPES.includes(chosen.type)) {
      setError("Please choose a PNG, JPG, GIF or WebP image.");
      return;
    }
    if (chosen.size > MAX_IMAGE_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    setError("");
    setFile(chosen);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canPost) return;
    setPosting(true);
    setError("");
    try {
      let img;
      if (file) {
        const data = new FormData();
        data.append("file", file);
        const uploaded = await axios.post("/upload", data);
        img = uploaded.data.filename;
      }
      const res = await axios.post("/posts", { userId: user._id, desc: trimmed, img });
      setText("");
      setFile(null);
      if (onPosted) onPosted(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <form className="share card" onSubmit={submit} aria-label="Create a post">
      <div className="shareTop">
        <Avatar user={user} size={40} />
        <label htmlFor="shareText" className="srOnly">
          What are you reading?
        </label>
        <textarea
          id="shareText"
          className="shareInput"
          placeholder={`What are you reading, ${user.username}?`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
          rows={trimmed ? 3 : 2}
        />
      </div>

      {preview && (
        <div className="sharePreview">
          <img src={preview} alt="Selected" />
          <button
            type="button"
            className="sharePreviewRemove"
            onClick={() => setFile(null)}
            aria-label="Remove photo"
          >
            <Close style={{ fontSize: 18 }} />
          </button>
        </div>
      )}

      {error && (
        <div className="errorBox" role="alert">
          {error}
        </div>
      )}

      <div className="shareBottom">
        <button
          type="button"
          className="btn btnGhost"
          onClick={() => fileInput.current.click()}
          disabled={posting}
        >
          <ImageOutlined style={{ fontSize: 20 }} />
          Photo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={chooseFile}
          hidden
          data-testid="share-file"
        />
        <div className="shareSubmit">
          {text.length > MAX_LENGTH - 50 && (
            <span className={`shareCount ${tooLong ? "over" : ""}`} aria-live="polite">
              {MAX_LENGTH - text.length}
            </span>
          )}
          <button type="submit" className="btn btnPrimary" disabled={!canPost}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}
