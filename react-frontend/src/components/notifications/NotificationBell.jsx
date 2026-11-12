import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { format } from "timeago.js";
import { NotificationsNone } from "@material-ui/icons";
import Avatar from "../avatar/Avatar";
import "./notifications.css";

export const POLL_MS = 60_000;

// Replies to your discussions. The server only returns notifications you
// may read right now (spoiler rule, membership, blocks), so nothing here
// can give away a later chapter.
export default function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get("/notifications");
      const items = Array.isArray(res?.data?.items) ? res.data.items : [];
      setData({ unread: Number(res?.data?.unread) || 0, items });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen((o) => !o);
  };

  const markAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((n) => ({ ...n, read: true })) }));
    try {
      await axios.post("/notifications/read");
    } catch {
      load();
    }
  };

  const markOne = (n) => {
    if (n.read) return;
    setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)) }));
    axios.post("/notifications/read", { ids: [n._id] }).catch(() => {});
    setOpen(false);
  };

  const label = data.unread ? `Notifications, ${data.unread} unread` : "Notifications";
  return (
    <div className="notifBox" ref={box}>
      <button type="button" className="btn btnGhost notifButton" aria-label={label} aria-expanded={open} aria-haspopup="true" onClick={toggle}>
        <NotificationsNone style={{ fontSize: 20 }} />
        {data.unread > 0 && (
          <span className="notifCount" aria-hidden="true">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notifPanel" role="region" aria-label="Notifications">
          <div className="notifHead">
            <strong>Notifications</strong>
            {data.unread > 0 && (
              <button type="button" className="linkBtn" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          {failed && data.items.length === 0 ? (
            <p className="notifEmpty" role="alert">
              Couldn't load notifications.
            </p>
          ) : data.items.length === 0 ? (
            <p className="notifEmpty">No notifications yet. When someone replies to your discussions or comments on your posts, you'll see it here.</p>
          ) : (
            <ul className="notifList">
              {data.items.map((n) => (
                <li key={n._id}>
                  <Link
                    to={n.type === "post_comment" ? `/posts/${n.post._id}` : `/threads/${n.thread._id}`}
                    className={`notifItem ${n.read ? "" : "unread"}`}
                    onClick={() => markOne(n)}
                  >
                    <Avatar user={n.actor} size={30} />
                    {n.type === "post_comment" ? (
                      <span className="notifText">
                        <span>
                          <strong>{n.actor.username}</strong> commented on your post
                          {n.post.preview ? (
                            <>
                              {" "}
                              <strong>“{n.post.preview}”</strong>
                            </>
                          ) : null}
                        </span>
                        {n.preview ? <span className="notifPreview">“{n.preview}”</span> : <span className="notifPreview">Hidden: the post has spoilers.</span>}
                        <span className="notifMeta">{format(n.createdAt)}</span>
                      </span>
                    ) : (
                      <span className="notifText">
                        <span>
                          <strong>{n.actor.username}</strong> replied to <strong>{n.thread.title}</strong>
                        </span>
                        <span className="notifPreview">“{n.preview}”</span>
                        <span className="notifMeta">
                          {n.circle.name} · Ch {n.thread.chapterSeq} · {format(n.createdAt)}
                        </span>
                      </span>
                    )}
                    {!n.read && <span className="notifDot" aria-label="Unread" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
