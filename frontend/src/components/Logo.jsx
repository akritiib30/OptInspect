import { useId } from "react";
import { Link } from "react-router-dom";

// An aperture: six blades inside a ring of heat-map colour, with one point of ring-light gold at the centre.
export function LogoMark({ size = 30, spin = false }) {
  const id = useId();
  return (
    <svg className={`logomark ${spin ? "spin" : ""}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD76B" /><stop offset=".55" stopColor="#FF8A3D" /><stop offset="1" stopColor="#E6446E" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21.5" fill="#080c18" stroke={`url(#${id}g)`} strokeWidth="2.6" />
      <g className="iris">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d="M24 9.5 L34.2 20.6 L24 24 Z" fill="rgba(255,236,196,.93)" stroke="#080c18" strokeWidth="1" transform={`rotate(${i * 60} 24 24)`} />
        ))}
      </g>
      <circle cx="24" cy="24" r="3.8" fill="#080c18" />
      <circle cx="24" cy="24" r="2.1" fill="#FFC857" />
    </svg>
  );
}

export function Wordmark({ size = 20 }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="w-opti">Opti</span><span className="w-inspect">Inspect</span>
    </span>
  );
}

export default function Logo({ to = "/", size = 30, text = true, spin = false }) {
  return (
    <Link to={to} className="logo" aria-label="OptiInspect home">
      <LogoMark size={size} spin={spin} />
      {text ? <Wordmark size={Math.round(size * 0.68)} /> : null}
    </Link>
  );
}
