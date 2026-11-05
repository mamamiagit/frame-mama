import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { colorways, type Colorway } from "../appearance";

export default function AppearancePicker({
  value,
  mode,
  onChange,
}: {
  value: Colorway;
  mode: string;
  onChange: (value: Colorway) => void;
}) {
  return (
    <fieldset className="colorway-picker">
      <legend>Colorway</legend>
      <p>A different atmosphere. The same space, still yours.</p>
      <div className="colorway-grid">
        {colorways.map((item) => (
          <label
            key={item.id}
            className={`colorway-option ${value === item.id ? "chosen" : ""}`}
            style={
              {
                "--swatch-accent": item.color,
                "--swatch-bg": mode === "light" ? item.light : item.dark,
              } as CSSProperties
            }
          >
            <input
              type="radio"
              name="colorway"
              value={item.id}
              checked={value === item.id}
              onChange={() => onChange(item.id)}
              aria-label={`${item.name} colorway`}
            />
            <span className="colorway-preview" aria-hidden="true">
              <span className="preview-top">
                <i />
                <i />
                <i />
              </span>
              <span className="preview-sidebar" />
              <span className="preview-hero" />
              <span className="preview-tile tile-one" />
              <span className="preview-tile tile-two" />
              <span className="preview-tile tile-three" />
            </span>
            <span className="colorway-name">
              <span className="colorway-dot" />
              {item.name}
              {value === item.id && <Check size={16} />}
            </span>
            <span className="colorway-description">{item.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
