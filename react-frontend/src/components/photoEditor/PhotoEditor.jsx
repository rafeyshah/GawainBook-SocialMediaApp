import { useContext, useRef, useState } from "react";
import axios from "axios";
import { PhotoCamera } from "@material-ui/icons";
import { AuthContext } from "../../context/AuthContext";
import { errorMessage } from "../../apiCalls";
import { MAX_IMAGE_BYTES } from "../share/Share";
import "./photoEditor.css";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// Change or remove your profile photo or cover image: upload the file, then
// save its key on your account. Calls onChange(newKey) when done.
export default function PhotoEditor({ field, label, hasImage, onChange, variant = "button" }) {
  const { user, dispatch } = useContext(AuthContext);
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (value) => {
    const res = await axios.put(`/users/${user._id}`, { [field]: value });
    const saved = res.data?.[field] ?? value;
    dispatch({ type: "UPDATE_USER", payload: { [field]: saved } });
    onChange(saved);
  };

  const choose = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError("Please choose a PNG, JPG, GIF or WebP image.");
    if (file.size > MAX_IMAGE_BYTES) return setError("Image must be 5 MB or smaller.");
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const uploaded = await axios.post("/upload", data);
      await save(uploaded.data.filename);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await save("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`photoEditor ${variant}`}>
      <div className="photoEditorButtons">
        <button
          type="button"
          className={variant === "badge" ? "photoBadge" : "btn btnSecondary photoButton"}
          onClick={() => input.current.click()}
          disabled={busy}
          aria-label={`Change ${label}`}
          title={`Change ${label}`}
        >
          <PhotoCamera style={{ fontSize: variant === "badge" ? 16 : 18 }} />
          {variant !== "badge" && <span>{busy ? "Uploading…" : `Change ${label}`}</span>}
        </button>
        {hasImage && variant !== "badge" && (
          <button type="button" className="btn btnSecondary photoButton" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={choose}
        hidden
        data-testid={`${field}-file`}
      />
      {error && (
        <span className="photoError" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
