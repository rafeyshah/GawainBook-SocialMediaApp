import "./avatar.css";

const PF = process.env.REACT_APP_PUBLIC_FOLDER || "/images/";
const COLORS = ["#2f7553", "#c8693f", "#4f7fa8", "#8c5a7a", "#b08a2e", "#3d8a8a"];

export const initialsOf = (name = "") =>
  name
    .replace(/[^\p{L}\p{N}\s_.-]/gu, "")
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

// Stable colour per name, so a reader always gets the same one.
export const colorFor = (name = "") => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
};

// Profile photo if the reader has one, otherwise their initials.
export default function Avatar({ user, size = 40 }) {
  const name = user?.username || "";
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };

  if (user?.profilePicture) {
    return <img className="avatar" style={style} src={PF + user.profilePicture} alt={name} />;
  }
  return (
    <span
      className="avatar avatarInitials"
      style={{ ...style, background: colorFor(name) }}
      role="img"
      aria-label={name || "Reader"}
    >
      {initialsOf(name)}
    </span>
  );
}
