import { WbSunnyOutlined, Brightness2Outlined } from "@material-ui/icons";
import useTheme from "../../useTheme";
import "./themeSwitcher.css";

const THEMES = [
  { value: "light", label: "Light", Icon: WbSunnyOutlined },
  { value: "dark", label: "Dark", Icon: Brightness2Outlined },
];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="themeSwitch" role="radiogroup" aria-label="Color theme">
      {THEMES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          className={theme === value ? "active" : ""}
          onClick={() => setTheme(value)}
        >
          <Icon style={{ fontSize: 16 }} />
          <span className="srOnly">{label}</span>
        </button>
      ))}
    </div>
  );
}
