import Topbar from "../topbar/Topbar";
import Sidebar from "../sidebar/Sidebar";
import "./layout.css";

// Shared shell for signed-in pages: top bar, sidebar and main column.
export default function Layout({ children }) {
  return (
    <div className="layout">
      <Topbar />
      <div className="layoutBody">
        <Sidebar />
        <main className="layoutMain">{children}</main>
      </div>
    </div>
  );
}
